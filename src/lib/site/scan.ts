import { blockedMessage, idsFromSource } from "../discover";
import { envNumber } from "../env";
import { safeFetch, safeFetchBytes } from "../url-safety";
import { detect } from "./detect";
import { fontSource, isIconFont, parseFontFaces, parseFontFile, pickFontUrl, sortWeights, VENDORS } from "./fonts";
import { apexDomain, lookupDns, readCertificate } from "./network";
import { COOKIE_HINTS } from "./signatures";
import { readSourceMap, sourceMapUrl } from "./sourcemap";
import { extractTokens } from "./tokens";
import type { Asset, DnsInfo, ExperienceSignal, FontFace, Infrastructure, Insight, PageMeta, SiteReport, SourceMapInfo, Tech } from "./types";

/**
 * Site DNA: reads a website the way a browser's first request would (HTML, headers, linked JavaScript, CSS and fonts)
 * and works out how it was built. Nothing is executed. Every request goes through safeFetch, which blocks private
 * networks, and the whole scan runs within a time and byte budget so it fits a serverless function.
 */

type Log = (text: string, level?: "info" | "ok" | "warn") => void;

const LIMITS = {
  seconds: envNumber("SITE_SCAN_SECONDS", 40),
  scripts: envNumber("SITE_MAX_SCRIPTS", 48),
  jsBytes: 30_000_000,
  fileBytes: 6_000_000,
  styles: 20,
  cssBytes: 3_000_000,
  fonts: 8,
  fontBytes: 4_000_000,
  maps: 3,
  mapBytes: 20_000_000,
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.8",
};

/** Hosts that serve a site's own code or open-source libraries, worth downloading. Trackers are identified by URL only. */
const CODE_HOSTS = /(?:^|\.)(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh|ga\.jspm\.io|cdn\.skypack\.dev|code\.jquery\.com|framerusercontent\.com|website-files\.com|cloudfront\.net|vercel\.app|netlify\.app|pages\.dev|cdn\.shopify\.com|squarespace-cdn\.com|static1\.squarespace\.com|parastorage\.com|tildacdn\.com|b-cdn\.net|webflow\.com)$/;
const FONT_CSS_HOSTS = /(?:^|\.)(?:fonts\.googleapis\.com|use\.typekit\.net|api\.fontshare\.com|fonts\.bunny\.net|use\.fontawesome\.com|kit\.fontawesome\.com|fast\.fonts\.net)$/;

const decode = (value: string) => value.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? decode(match[1] ?? match[2] ?? match[3] ?? "") : null;
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await run(items[next++]);
  }));
}

const within = <T>(promise: Promise<T>, ms: number, fallback: T) => Promise.race([promise.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), Math.max(0, ms)))]);

interface ParsedHtml {
  scripts: string[];
  styles: string[];
  preloadedFonts: string[];
  otherUrls: string[];
  inlineCss: string;
  meta: Record<string, string>;
  page: Omit<PageMeta, "trackingIds" | "manifest"> & { manifest: boolean };
}

function parseHtml(html: string, base: string | null): ParsedHtml {
  const resolve = (value: string | null) => {
    if (!value || /^(?:data|javascript|blob|about|mailto|tel):/i.test(value)) return null;
    if (!base) return /^https?:\/\//i.test(value) ? value : null;
    try { return new URL(value, base).toString(); } catch { return null; }
  };
  const scripts: string[] = [];
  const styles: string[] = [];
  const preloadedFonts: string[] = [];
  const otherUrls: string[] = [];
  const meta: Record<string, string> = {};
  const hreflang: string[] = [];
  let canonical: string | null = null;
  let manifest = false;
  for (const [tag, name] of html.matchAll(/<(script|link|meta)\b[^>]*>/gi)) {
    const kind = name.toLowerCase();
    if (kind === "script") {
      const src = resolve(attr(tag, "src"));
      if (src) scripts.push(src);
    } else if (kind === "link") {
      const rel = (attr(tag, "rel") ?? "").toLowerCase();
      const href = resolve(attr(tag, "href"));
      const as = (attr(tag, "as") ?? "").toLowerCase();
      if (rel.includes("alternate") && attr(tag, "hreflang")) hreflang.push(attr(tag, "hreflang")!);
      if (rel === "canonical") canonical = href;
      if (rel === "manifest") manifest = true;
      if (!href) continue;
      if (rel.includes("stylesheet") || (rel.includes("preload") && as === "style")) styles.push(href);
      else if (rel.includes("modulepreload") || (rel.includes("preload") && as === "script")) scripts.push(href);
      else if (rel.includes("preload") && as === "font") preloadedFonts.push(href);
      else otherUrls.push(href);
    } else {
      const key = (attr(tag, "name") ?? attr(tag, "property") ?? attr(tag, "http-equiv") ?? "").toLowerCase();
      const content = attr(tag, "content");
      if (key && content !== null && meta[key] === undefined) meta[key] = content;
    }
  }
  for (const [, src] of html.matchAll(/<(?:img|source|video|iframe)\b[^>]*\s(?:src|data-src)=["']([^"']+)["']/gi)) {
    const url = resolve(decode(src));
    if (url) otherUrls.push(url);
  }
  const inlineCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join("\n");
  const jsonLdTypes = new Set<string>();
  for (const [, body] of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const [, type] of body.matchAll(/"@type"\s*:\s*"([\w:]+)"/g)) jsonLdTypes.add(type.replace(/^schema:/, ""));
  }
  const text = (pattern: RegExp) => { const value = pattern.exec(html)?.[1]; return value ? decode(value).replace(/\s+/g, " ").trim() : null; };
  return {
    scripts: [...new Set(scripts)],
    styles: [...new Set(styles)],
    preloadedFonts: [...new Set(preloadedFonts)],
    otherUrls: [...new Set(otherUrls)],
    inlineCss,
    meta,
    page: {
      title: text(/<title[^>]*>([^<]*)<\/title>/i),
      description: meta.description ?? meta["og:description"] ?? null,
      lang: text(/<html\b[^>]*\slang=["']?([\w-]+)/i),
      hreflang: [...new Set(hreflang)],
      canonical,
      generator: meta.generator ?? null,
      themeColor: meta["theme-color"] ?? null,
      ogImage: resolve(meta["og:image"] ?? null),
      robots: meta.robots ?? null,
      jsonLdTypes: [...jsonLdTypes].slice(0, 12),
      manifest,
    },
  };
}

/** Script URLs that pages mention without a <script> tag: Next.js flight data, Vite dependency maps, ES imports. */
function mentionedScripts(text: string, fileUrl: string): string[] {
  const output = new Set<string>();
  const add = (value: string, base: string) => { try { output.add(new URL(value, base).toString()); } catch { /* ignore */ } };
  const next = fileUrl.indexOf("/_next/");
  if (next !== -1) for (const [, path] of text.matchAll(/["'\\](?:\/[\w.-]*)*?\/?(static\/chunks\/[\w./~@-]+?\.js)(?=\\?["'?])/g)) add(path, fileUrl.slice(0, next + 7));
  for (const [, path] of text.matchAll(/["'](assets\/[\w.-]+\.m?js)["']/g)) add(path, new URL("../", fileUrl).toString());
  for (const [, path] of text.matchAll(/(?:import|from)\s*\(?\s*["'](\.{1,2}\/[\w./-]+\.m?js)["']/g)) add(path, fileUrl);
  for (const [, path] of text.matchAll(/["']((?:\/[\w.-]+)*\/(?:_nuxt|_astro|_app\/immutable\/(?:chunks|entry|nodes))\/[\w./-]+\.m?js)["']/g)) add(path, fileUrl);
  return [...output];
}

const GLSL = /void\s+main\s*\(\s*(?:void\s*)?\)\s*\{/g;

/** The raw files a scan read, handed to `collect` (the AI Website Detector reads them) and never kept by the scan. */
export interface ScanFiles {
  html: string;
  headers: Record<string, string>;
  js: { url: string; text: string }[];
  css: { url: string; text: string }[];
  /** Public source maps, unparsed. */
  maps: { url: string; body: string }[];
}

/**
 * `url` fetches the page; `html` scans given source. `html` + `baseUrl` scans a page rendered elsewhere (the deep scan
 * fallback for sites that refuse plain requests): files resolve against `baseUrl` and DNS/TLS are still read.
 * `collect` receives the raw files once the scan has read them.
 */
export async function scanSite(input: { url?: string; html?: string; baseUrl?: string }, log: Log, signal?: AbortSignal, collect?: (files: ScanFiles) => void): Promise<SiteReport> {
  const started = Date.now();
  // Every request stops when its own timeout passes or the visitor cancels the scan.
  const limit = (ms: number) => (signal ? AbortSignal.any([AbortSignal.timeout(Math.max(1, ms)), signal]) : AbortSignal.timeout(Math.max(1, ms)));
  signal?.throwIfAborted();
  const deadline = started + LIMITS.seconds * 1000;
  const remaining = () => deadline - Date.now();

  // ── 1. The page ─────────────────────────────────────────────────────────────────────────────────────────────────
  let html = input.html ?? "";
  let finalUrl = input.url ?? input.baseUrl ?? "";
  let response: Response | null = null;
  if (input.url) {
    log(`GET ${input.url}`);
    const page = await safeFetch(input.url, { headers: HEADERS, signal: limit(15_000) }, { redirects: 5, bytes: 4_000_000 }).catch((error: Error & { cause?: { code?: string } }) => {
      // Node reports network failures as a bare "fetch failed"; say what actually happened.
      const code = error.cause?.code ?? (error.name === "TimeoutError" ? "timed out" : null);
      if (error.message === "fetch failed" || error.name === "TimeoutError") throw new Error(`Could not connect to ${new URL(input.url!).hostname}${code ? ` (${code})` : ""}. The site may be down, or refusing connections from this server.`);
      throw error;
    });
    if (!page.response.ok) throw new Error(blockedMessage(page.response, page.body));
    html = page.body;
    finalUrl = page.finalUrl;
    response = page.response;
    if (finalUrl !== input.url) log(`Redirected to ${finalUrl}`);
    log(`Read ${Math.round(html.length / 1024)} KB of HTML (HTTP ${page.response.status})`, "ok");
  }
  // Pasted source has no address; the canonical or og:url link tells us where its relative files live.
  if (!finalUrl) {
    const hinted = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']|<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i.exec(html);
    const guess = hinted?.[1] ?? hinted?.[2];
    if (guess && /^https?:\/\//i.test(guess)) { finalUrl = decode(guess); log(`Using ${new URL(finalUrl).hostname} (from the page's canonical link) to resolve its files`); }
  }
  const host = finalUrl ? new URL(finalUrl).hostname : "pasted-source";
  const apex = finalUrl ? apexDomain(host) : "";
  const sameSite = (url: string) => { try { const h = new URL(url).hostname; return h === apex || h.endsWith(`.${apex}`); } catch { return false; } };
  const fetchable = (url: string) => { try { const h = new URL(url).hostname; return sameSite(url) || CODE_HOSTS.test(h); } catch { return false; } };

  const live = !!(input.url || input.baseUrl);
  const dnsPromise: Promise<DnsInfo | null> = finalUrl && live ? lookupDns(host).catch(() => null) : Promise.resolve(null);
  const certPromise = finalUrl && live ? readCertificate(host).catch(() => ({ tls: null, ips: [] as string[] })) : Promise.resolve({ tls: null, ips: [] as string[] });

  const parsed = parseHtml(html, finalUrl || null);
  const assets: Asset[] = [];
  const js: { url: string; text: string; sourceMap: string | null }[] = [];
  const css: { url: string; text: string }[] = [];

  // ── 2. JavaScript: <script> tags, preloads, then chunks the page and its bundles mention ────────────────────────
  const queued = new Set<string>();
  const queue: string[] = [];
  const enqueue = (url: string) => { const clean = url.split("#")[0]; if (!queued.has(clean) && fetchable(clean) && !/\.json(?:\?|$)/.test(clean)) { queued.add(clean); queue.push(clean); } };
  parsed.scripts.forEach(enqueue);
  if (finalUrl) mentionedScripts(html, parsed.scripts.find((url) => url.includes("/_next/")) ?? finalUrl).forEach(enqueue);
  let jsBytes = 0;
  // Transient failures (network errors, timeouts, 403/429/5xx) make a scan incomplete; stable 404s do not.
  let failed = 0;
  const transient = (status: number) => status !== 404 && status !== 410;
  const fetchScript = async (url: string) => {
    if (js.length >= LIMITS.scripts || jsBytes > LIMITS.jsBytes) return;
    // Running out of time reads fewer files than a normal scan would: count it as incomplete, like a failed fetch.
    if (remaining() < 8000) { failed++; return; }
    try {
      const result = await safeFetch(url, { headers: { ...HEADERS, Accept: "*/*", Referer: finalUrl }, signal: limit(Math.min(12_000, remaining())) }, { redirects: 3, bytes: LIMITS.fileBytes });
      if (!result.response.ok) { if (transient(result.response.status)) failed++; return; }
      if (/^\s*</.test(result.body.slice(0, 200))) return;
      jsBytes += result.body.length;
      js.push({ url, text: result.body, sourceMap: result.response.headers.get("sourcemap") ?? result.response.headers.get("x-sourcemap") });
      for (const mention of mentionedScripts(result.body, url)) if (sameSite(mention) || new URL(mention).hostname === new URL(url).hostname) enqueue(mention);
    } catch { failed++; /* one unreachable file should not stop the scan */ }
  };
  if (queue.length) log(`Reading ${Math.min(queue.length, LIMITS.scripts)} of ${queue.length} JavaScript files found so far`);
  for (let wave = 0; wave < 3 && queue.length && remaining() > 8000; wave++) {
    const batch = queue.splice(0, Math.max(0, LIMITS.scripts - js.length));
    await pool(batch, 8, fetchScript);
    if (wave === 0 && queue.length) log(`Following ${queue.length} chunks referenced by the bundles`);
  }
  const skipped = Math.max(0, queued.size - js.length);
  if (js.length) log(`Scanned ${js.length} scripts (${Math.round(jsBytes / 1024)} KB)`, "ok");

  // ── 3. CSS: stylesheets, font-service CSS, @imports, inline <style> ──────────────────────────────────────────────
  // Bundlers (Vite, Next.js) also inject stylesheets from JavaScript; their paths appear in the bundles.
  const injected = js.flatMap((file) => [...file.text.matchAll(/["'`]((?:\/?[\w.-]+\/)*(?:assets|static\/css|static\/chunks)\/[\w.-]+\.css)["'`]/g)].map((match) => {
    const base = match[1].startsWith("assets/") ? new URL("../", file.url).toString() : file.url.includes("/_next/") && !match[1].startsWith("/") ? file.url.slice(0, file.url.indexOf("/_next/") + 7) : file.url;
    try { return new URL(match[1], base).toString(); } catch { return null; }
  })).filter((item): item is string => !!item);
  const styleQueue = [...new Set([...parsed.styles, ...injected])].filter((url) => fetchable(url) || FONT_CSS_HOSTS.test(new URL(url).hostname)).slice(0, LIMITS.styles);
  const fetchStyle = async (url: string, depth = 0) => {
    if (css.length >= LIMITS.styles || remaining() < 6000) return;
    try {
      const result = await safeFetch(url, { headers: { ...HEADERS, Accept: "text/css,*/*;q=0.1", Referer: finalUrl }, signal: limit(Math.min(10_000, remaining())) }, { redirects: 3, bytes: LIMITS.cssBytes });
      if (!result.response.ok) { if (transient(result.response.status)) failed++; return; }
      css.push({ url, text: result.body });
      if (depth === 0) {
        const imports = [...result.body.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)/g)].map((match) => { try { return new URL(match[1], url).toString(); } catch { return null; } }).filter((item): item is string => !!item);
        await pool(imports.slice(0, 4), 4, (item) => fetchStyle(item, 1));
      }
    } catch { failed++; }
  };
  if (styleQueue.length) log(`Reading ${styleQueue.length} stylesheet${styleQueue.length === 1 ? "" : "s"}`);
  await pool(styleQueue, 6, (url) => fetchStyle(url));
  if (parsed.inlineCss) css.push({ url: "", text: parsed.inlineCss });
  const allCss = css.map((file) => file.text).join("\n");

  signal?.throwIfAborted();
  // ── 4. Detection ────────────────────────────────────────────────────────────────────────────────────────────────
  const headers: Record<string, string> = {};
  response?.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  const cookies = response ? response.headers.getSetCookie().map((cookie) => cookie.split("=")[0].trim()).filter(Boolean) : [];
  const urls = [...new Set([...parsed.scripts, ...parsed.styles, ...parsed.preloadedFonts, ...parsed.otherUrls, ...queued])];
  const { techs, files } = detect({ html, urls, js, css, headers, cookies, meta: parsed.meta }, host);
  log(`Identified ${techs.length} technologies`, "ok");

  const wordpress = techs.some((tech) => tech.name === "WordPress") ? {
    theme: /\/wp-content\/themes\/([\w.-]+)\//.exec(html)?.[1] ?? null,
    plugins: [...new Set([...html.matchAll(/\/wp-content\/plugins\/([\w.-]+)\//g)].map((match) => match[1]))].slice(0, 40),
  } : null;
  const shopifyTheme = /Shopify\.theme\s*=\s*\{[^}]*"name"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  if (shopifyTheme) { const shopify = techs.find((tech) => tech.name === "Shopify"); if (shopify) shopify.evidence.push({ where: "theme", match: shopifyTheme }); }

  // ── 5. Fonts ────────────────────────────────────────────────────────────────────────────────────────────────────
  const faces = new Map<string, FontFace>();
  for (const file of css) parseFontFaces(file.text, file.url || finalUrl || "https://invalid.local/", host, faces);
  const tokens = extractTokens(allCss);
  for (const face of faces.values()) {
    const needle = face.family.toLowerCase();
    face.usage = tokens.fontStacks.reduce((sum, item) => sum + (item.stack.toLowerCase().split(", ").includes(needle) ? item.count : 0), 0);
    face.weights = sortWeights(face.weights);
  }
  const fontList = [...faces.values()].filter((face) => face.urls.length && !/fallback/i.test(face.family));
  // Fonts preloaded by the page but declared in CSS we could not see (e.g. injected by JavaScript).
  const declared = new Set(fontList.flatMap((face) => face.urls));
  for (const url of parsed.preloadedFonts.filter((item) => !declared.has(item)).slice(0, 4)) {
    fontList.push({ family: decodeURIComponent(url.split("/").pop()!.replace(/\.(woff2?|ttf|otf)(\?.*)?$/i, "")), source: fontSource(url, host), weights: [], styles: [], formats: [/\.woff2/i.test(url) ? "woff2" : "font"], display: null, scripts: [], urls: [url], file: null, usage: 0, aliases: [] });
  }
  const toRead = fontList.filter((face) => !isIconFont(face.family)).sort((a, b) => b.usage - a.usage).slice(0, LIMITS.fonts);
  if (toRead.length && remaining() > 5000) {
    log(`Opening ${toRead.length} font file${toRead.length === 1 ? "" : "s"} to read names, foundries and licenses`);
    await pool(toRead, 4, async (face) => {
      const url = pickFontUrl(face);
      if (!url || remaining() < 4000) return;
      try {
        const result = await safeFetchBytes(url, { headers: { ...HEADERS, Accept: "font/woff2,font/woff,*/*;q=0.5", Referer: finalUrl || url, ...(finalUrl ? { Origin: new URL(finalUrl).origin } : {}) }, signal: limit(Math.min(10_000, remaining())) }, { redirects: 3, bytes: LIMITS.fontBytes });
        if (!result.response.ok) return;
        face.file = parseFontFile(result.bytes, url);
        face.file.foundry ??= face.file.vendorId ? VENDORS[face.file.vendorId] ?? null : null;
        if (!face.scripts.length) face.scripts = face.file.scripts.map((item) => item.name);
        assets.push({ url, kind: "font", bytes: result.bytes.length, firstParty: sameSite(url), techs: [] });
      } catch { /* unreadable font */ }
    });
  }
  const fonts = mergeFaces(fontList).sort((a, b) => Number(isIconFont(a.family)) - Number(isIconFont(b.family)) || Number(!!b.file) - Number(!!a.file) || b.usage - a.usage || a.family.localeCompare(b.family));

  // ── 6. Source maps ──────────────────────────────────────────────────────────────────────────────────────────────
  const sourceMaps: SourceMapInfo[] = [];
  const mapBodies: { url: string; body: string }[] = [];
  const own =js.filter((file) => sameSite(file.url)).sort((a, b) => b.text.length - a.text.length);
  const candidates = own.map((file, index) => ({ file, map: sourceMapUrl(file.url, file.text, file.sourceMap) ?? (index < 2 ? `${file.url.split("?")[0]}.map` : null) })).filter((item) => item.map).slice(0, 6);
  for (const { file, map } of candidates) {
    if (sourceMaps.length >= LIMITS.maps || remaining() < 5000) break;
    try {
      const result = await safeFetch(map!, { headers: { ...HEADERS, Accept: "application/json,*/*" }, signal: limit(Math.min(10_000, remaining())) }, { redirects: 2, bytes: LIMITS.mapBytes });
      if (!result.response.ok || !result.body.trimStart().startsWith("{")) continue;
      const info = readSourceMap(file.url, map!, result.body);
      if (info && collect) mapBodies.push({ url: map!, body: result.body });
      if (info) { sourceMaps.push(info); assets.push({ url: map!, kind: "sourcemap", bytes: result.body.length, firstParty: true, techs: [] }); log(`Public source map: ${info.files} original files, ${info.packages.length} npm packages`, "warn"); }
    } catch { /* no map */ }
  }

  // ── 7. Infrastructure, DNS, page facts ──────────────────────────────────────────────────────────────────────────
  const [dns, cert] = await Promise.all([within(dnsPromise, Math.max(1500, remaining()), null), within(certPromise, Math.max(1500, remaining()), { tls: null, ips: [] as string[] })]);
  if (dns) log(`DNS: ${[dns.dnsProvider, dns.mailProvider && `mail by ${dns.mailProvider}`].filter(Boolean).join(", ") || "read"}`);
  const infra: Infrastructure | null = response ? {
    finalUrl,
    status: response.status,
    server: headers.server ?? null,
    poweredBy: headers["x-powered-by"] ?? null,
    httpVersion: /\bh3\b/.test(headers["alt-svc"] ?? "") ? "HTTP/3" : "HTTP/2 or older",
    compression: headers["content-encoding"] ?? null,
    cacheControl: headers["cache-control"] ?? null,
    securityHeaders: ([
      ["strict-transport-security", "HSTS"], ["content-security-policy", "Content Security Policy"], ["x-frame-options", "Clickjacking protection"],
      ["x-content-type-options", "No MIME sniffing"], ["referrer-policy", "Referrer policy"], ["permissions-policy", "Permissions policy"], ["cross-origin-opener-policy", "Cross-origin isolation"],
    ] as const).map(([name, label]) => ({ name, label, present: headers[name] !== undefined || (name === "x-frame-options" && /frame-ancestors/.test(headers["content-security-policy"] ?? "")), value: headers[name] ?? null })),
    cookies: [...new Set(cookies)].map((name) => ({ name, hint: COOKIE_HINTS.find(([pattern]) => pattern.test(name))?.[1] ?? null })),
    cspHosts: cspHosts(headers["content-security-policy"] ?? "", apex),
    tls: cert.tls,
    ips: cert.ips,
  } : null;

  for (const file of js) assets.push({ url: file.url, kind: "script", bytes: file.text.length, firstParty: sameSite(file.url), techs: files.get(file.url) ?? [] });
  for (const file of css.filter((item) => item.url)) assets.push({ url: file.url, kind: "style", bytes: file.text.length, firstParty: sameSite(file.url), techs: files.get(file.url) ?? [] });
  assets.sort((a, b) => b.bytes - a.bytes);

  const allJs = js.map((file) => file.text);
  const shaders = allJs.reduce((sum, text) => sum + (text.match(GLSL) ?? []).length, 0);
  const trackingIds = [...new Set(idsFromSource(html).map((item) => item.id))];
  const page: PageMeta = { ...parsed.page, trackingIds };
  const experience = experienceSignals(techs, allCss, allJs, html, tokens.fluidType.length > 0, shaders);
  const totals = {
    html: html.length, js: jsBytes, css: css.reduce((sum, file) => sum + file.text.length, 0),
    fonts: assets.filter((item) => item.kind === "font").reduce((sum, item) => sum + item.bytes, 0), scripts: js.length, styles: css.filter((item) => item.url).length, skipped, failed,
  };

  const report: SiteReport = {
    url: input.url ?? finalUrl, finalUrl, host, fetchedAt: new Date().toISOString(), durationMs: 0, source: input.html && !input.baseUrl ? "html" : "url",
    recipe: "", techs, wordpress, experience, shaders, fonts, tokens, infra, dns, assets, sourceMaps, totals, page, insights: [], limits: [],
  };
  report.recipe = recipe(report);
  report.insights = insights(report);
  report.limits = limits(report);
  report.durationMs = Date.now() - started;
  collect?.({ html, headers, js: js.map(({ url, text }) => ({ url, text })), css: css.map(({ url, text }) => ({ url, text })), maps: mapBodies });
  return report;
}

/** next/font renames families to "__Inter_a1b2c3"; show the real name. */
function prettyFamily(family: string): string {
  const next = /^__(.+?)_[0-9a-f]{6}$/i.exec(family);
  return (next ? next[1] : family).replace(/_/g, " ");
}

const WEIGHT_SUFFIX = /(?:thin|hairline|extralight|ultralight|light|regular|book|normal|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy|italic|oblique)+$/i;

/** The CSS family name, unless the font file names it better (a preloaded file, or "nb international proregular" → "NB International Pro"). */
function displayFamily(pretty: string, face: FontFace): string {
  const real = face.file?.family;
  if (!real) return pretty;
  const squash = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, "");
  return !face.weights.length || (pretty !== real && squash(pretty).startsWith(squash(real))) ? real : pretty;
}

/** Sites often declare one family per weight ("ArtDecoBold", "ArtDecoMedium"); fold those into one typeface. */
function mergeFaces(faces: FontFace[]): FontFace[] {
  const merged = new Map<string, FontFace>();
  for (const face of faces) {
    const pretty = prettyFamily(face.family);
    const key = (face.file?.family ?? pretty.replace(WEIGHT_SUFFIX, "")).toLowerCase().replace(/[\s_-]+/g, "");
    const existing = merged.get(key);
    if (!existing) { merged.set(key, { ...face, family: displayFamily(pretty, face) }); continue; }
    if (pretty !== existing.family && !existing.aliases.includes(pretty)) existing.aliases.push(pretty);
    existing.weights = sortWeights([...new Set([...existing.weights, ...face.weights])]);
    existing.styles = [...new Set([...existing.styles, ...face.styles])];
    existing.formats = [...new Set([...existing.formats, ...face.formats])];
    existing.scripts = [...new Set([...existing.scripts, ...face.scripts])];
    existing.urls = [...new Set([...existing.urls, ...face.urls])];
    existing.usage += face.usage;
    existing.file ??= face.file;
  }
  return [...merged.values()];
}

function cspHosts(policy: string, apex: string): string[] {
  const hosts = new Set<string>();
  for (const token of policy.split(/[\s;]+/)) {
    const host = token.replace(/^[a-z]+:\/\//i, "").replace(/^\*\./, "").split(/[/:]/)[0].toLowerCase();
    if (host.includes(".") && !host.startsWith("'") && host !== apex && !host.endsWith(`.${apex}`) && /^[a-z0-9.-]+$/.test(host)) hosts.add(host);
  }
  return [...hosts].sort().slice(0, 80);
}

function experienceSignals(techs: Tech[], css: string, js: string[], html: string, fluid: boolean, shaders: number): ExperienceSignal[] {
  const names = (...categories: Tech["category"][]) => techs.filter((tech) => categories.includes(tech.category)).map((tech) => tech.name);
  const inJs = (pattern: RegExp) => js.some((text) => pattern.test(text));
  const smooth = names("Smooth scroll");
  const threeD = names("3D & WebGL");
  const motion = names("Animation");
  const transitions = names("Page transitions");
  const vector = names("Vector animation");
  const webgl = threeD.length > 0 || inJs(/getContext\(\s*["']webgl2?["']|getContext\(\s*["']experimental-webgl/);
  const reduced = /prefers-reduced-motion/.test(css) || inJs(/prefers-reduced-motion/);
  const signal = (key: string, label: string, description: string, on: boolean, detail: string | null = null): ExperienceSignal => ({ key, label, description, on, detail });
  return [
    signal("smooth", "Smooth scrolling", "Scroll position is eased by JavaScript (or CSS scroll-behavior) instead of jumping.", smooth.length > 0 || /scroll-behavior\s*:\s*smooth/.test(css), smooth.join(", ") || (/scroll-behavior\s*:\s*smooth/.test(css) ? "CSS scroll-behavior" : null)),
    signal("timeline", "Timeline animation", "A JavaScript animation engine choreographs motion.", motion.length > 0, motion.join(", ") || null),
    signal("scroll", "Scroll-driven motion", "Animations are tied to scroll position (scrubbing, pinning, parallax).", techs.some((tech) => /ScrollTrigger|ScrollSmoother|Locomotive/.test(tech.name)) || /animation-timeline|view-timeline/.test(css) || inJs(/useScroll\(|scrollYProgress/), null),
    signal("webgl", "WebGL / 3D", "A GPU-rendered canvas draws 3D scenes, particles or image effects.", webgl, threeD.join(", ") || null),
    signal("shaders", "Custom shaders", "Hand-written GLSL programs for effects no library ships with.", shaders > 0, shaders ? `${shaders} shader program${shaders === 1 ? "" : "s"}` : null),
    signal("transitions", "Page transitions", "Navigating animates between pages instead of reloading.", transitions.length > 0, transitions.join(", ") || null),
    signal("vector", "Vector animation", "Rive or Lottie files animate illustrations and UI.", vector.length > 0, vector.join(", ") || null),
    signal("split", "Split-text reveals", "Headlines are split into letters, words or lines to animate them.", techs.some((tech) => /SplitText|Splitting/.test(tech.name)) || inJs(/SplitType|split-type/), null),
    signal("cursor", "Custom cursor", "The system cursor is hidden and replaced by an animated element.", /cursor\s*:\s*none/.test(css), null),
    signal("video", "Background video", "Autoplaying, muted video used as a visual layer.", /<video\b[^>]*\b(?:autoplay[^>]*muted|muted[^>]*autoplay)/i.test(html), null),
    signal("fluid", "Fluid typography", "Type sizes scale continuously with the viewport using clamp().", fluid, null),
    signal("reduced", "Respects reduced motion", "Honours the visitor's 'reduce motion' accessibility setting.", reduced, null),
  ];
}

export function recipe(report: SiteReport): string {
  const get = (...categories: Tech["category"][]) => report.techs.filter((tech) => categories.includes(tech.category) && tech.confidence !== "low");
  const label = (tech: Tech) => (tech.version ? `${tech.name} ${tech.version.replace(/^(\d+\.\d+)\.\d+.*$/, "$1")}` : tech.name);
  const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
  const sentences: string[] = [];
  const builder = get("Site builder", "CMS", "E-commerce").filter((tech) => !tech.implied);
  const meta = get("Meta-framework").filter((tech) => tech.name !== "Next.js App Router");
  const framework = get("Framework").filter((tech) => !meta.length || !tech.implied);
  const router = report.techs.some((tech) => tech.name === "Next.js App Router") ? " (App Router)" : "";
  if (builder.length) sentences.push(`Built with ${list(builder.slice(0, 3).map(label))}${meta.length ? ` on ${list(meta.map(label))}` : ""}.`);
  else if (meta.length) sentences.push(`Built with ${list(meta.map(label))}${router}${framework.length ? ` on ${list(framework.map(label))}` : ""}.`);
  else if (framework.length) sentences.push(`Built with ${list(framework.map(label))}.`);
  else sentences.push("No front-end framework or site builder detected: likely hand-written HTML, CSS and JavaScript.");
  const build = get("Build tool").filter((tech) => tech.name !== "webpack" || !report.techs.some((item) => item.name === "Turbopack"));
  if (build.length) sentences.push(`Bundled with ${list(build.map(label))}.`);
  const styling = get("UI framework", "Component library", "CSS");
  if (styling.length) sentences.push(`Styled with ${list(styling.map(label))}.`);
  const motion = get("Animation", "Smooth scroll", "Page transitions", "3D & WebGL", "Vector animation", "Creative coding").filter((tech) => !tech.implied || tech.category !== "Animation");
  if (motion.length) sentences.push(`Motion: ${list(motion.map(label))}${report.shaders ? `, with ${report.shaders} custom GLSL shader${report.shaders === 1 ? "" : "s"}` : ""}.`);
  const hosting = get("Hosting", "CDN");
  const server = get("Web server");
  if (hosting.length || server.length) sentences.push(`Served by ${list([...hosting, ...server].map((tech) => tech.name))}.`);
  const backend = report.techs.filter((tech) => (tech.category === "Backend" || tech.category === "Language") && !["TypeScript", "WebAssembly"].includes(tech.name));
  if (backend.length) sentences.push(`Server side: ${list(backend.map((tech) => tech.name))}${backend.every((tech) => tech.confidence !== "high") ? " (inferred)" : ""}.`);
  const type = report.fonts.filter((face) => !isIconFont(face.family)).slice(0, 3);
  if (type.length) sentences.push(`Type set in ${list(type.map((face) => `${face.file?.family ?? face.family} (${face.source === "Self-hosted" ? "self-hosted" : face.source})`))}.`);
  return sentences.join(" ");
}

export function insights(report: SiteReport): Insight[] {
  const output: Insight[] = [];
  const reduced = report.experience.find((item) => item.key === "reduced")?.on;
  const motionHeavy = report.experience.filter((item) => ["smooth", "timeline", "webgl", "scroll", "transitions"].includes(item.key) && item.on).length;
  if (report.sourceMaps.length) {
    const files = report.sourceMaps.reduce((sum, map) => sum + map.files, 0);
    output.push({ tone: "warn", icon: "source", text: `Public source maps expose ${files.toLocaleString()} original source files, including exact npm package names.` });
  }
  if (motionHeavy >= 2) output.push({ tone: reduced ? "good" : "warn", icon: "animation", text: reduced ? "Heavy motion, and it respects the visitor's reduced-motion setting." : "Heavy motion, but nothing checks prefers-reduced-motion, so visitors who turn off animations still get them." });
  if (report.shaders) output.push({ tone: "info", icon: "blur_on", text: `${report.shaders} custom GLSL shader program${report.shaders === 1 ? "" : "s"} found in the JavaScript.` });
  const variable = report.fonts.filter((face) => face.file?.axes.length).length;
  const selfHosted = report.fonts.filter((face) => face.source === "Self-hosted").length;
  if (report.fonts.length) output.push({ tone: "info", icon: "match_case", text: `${report.fonts.length} font famil${report.fonts.length === 1 ? "y" : "ies"}: ${selfHosted} self-hosted${variable ? `, ${variable} variable` : ""}.` });
  if (report.infra) {
    if (report.infra.httpVersion === "HTTP/3") output.push({ tone: "good", icon: "bolt", text: "HTTP/3 (QUIC) is advertised for faster connections." });
    const missing = report.infra.securityHeaders.filter((item) => !item.present && ["strict-transport-security", "content-security-policy"].includes(item.name));
    if (missing.length) output.push({ tone: "warn", icon: "shield", text: `Missing ${missing.map((item) => item.label).join(" and ")}.` });
  }
  const ownJs = report.assets.filter((item) => item.kind === "script" && item.firstParty).reduce((sum, item) => sum + item.bytes, 0);
  if (ownJs > 1_500_000) output.push({ tone: "warn", icon: "weight", text: `${(ownJs / 1_000_000).toFixed(1)} MB of first-party JavaScript (uncompressed) in the files scanned.` });
  if (report.dns?.dmarc === "reject" || report.dns?.dmarc === "quarantine") output.push({ tone: "good", icon: "mark_email_read", text: `Email is protected by a DMARC ${report.dns.dmarc} policy.` });
  return output;
}

function limits(report: SiteReport): string[] {
  const output = [
    "Only what the first page load serves is read. Files loaded later by JavaScript (lazy chunks, WebGL assets, fonts injected at runtime) may be missing.",
    "Backend languages and frameworks can't be seen directly. They are inferred from headers and cookie names, so treat them as likely, not certain.",
  ];
  if (report.totals.skipped) output.push(`${report.totals.skipped} more script${report.totals.skipped === 1 ? " was" : "s were"} referenced but not read, to stay within the scan budget.`);
  if (report.totals.failed) output.push(`${report.totals.failed} file${report.totals.failed === 1 ? "" : "s"} failed to load (timeouts or refusals, often rate limiting), so some technologies may be missing. Rescan in a minute.`);
  if (report.source === "html") output.push("Scanned from pasted page source: response headers, cookies, TLS and hosting details are not available.");
  return output;
}

