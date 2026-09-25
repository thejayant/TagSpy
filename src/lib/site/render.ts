import dns from "node:dns/promises";
import fs from "node:fs";
import type { Browser, CDPSession, Page } from "puppeteer-core";
import { blockedMessage } from "../discover";
import { envNumber, envString } from "../env";
import { isPrivateAddress } from "../url-safety";
import { detect } from "./detect";
import { apexDomain } from "./network";
import { COLLECT, COUNT_RUNNING, INSTALL_PROBES, VITALS } from "./probes";
import type { RuntimeAsset, RuntimeReport, Tech } from "./types";

/**
 * Deep scan: renders a page in headless Chromium and records what only exists at runtime. Built for a 60 s serverless
 * function: one browser per scan, a hard deadline that returns partial results, and a private-network guard on every
 * request the page makes.
 *
 * Providers, in order of preference:
 *   cloudflare — Cloudflare Browser Run over CDP (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN): a browser on Cloudflare's
 *                network, so nothing heavy runs in our function. Free plan: 10 browser-minutes a day, 3 at once.
 *   remote     — BROWSER_WS_ENDPOINT (Browserless, a self-hosted Chrome, …) via puppeteer.connect
 *   local      — CHROME_PATH, or Chrome/Edge/Chromium installed on this machine (development, Render, Docker)
 *   serverless — @sparticuz/chromium-min on Vercel/AWS; the Chromium pack is downloaded once per instance into /tmp
 */

type Log = (text: string, level?: "info" | "ok" | "warn") => void;
type Provider = RuntimeReport["provider"];

const DEFAULT_PACK = "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";
const BUDGET_MS = envNumber("DEEP_SCAN_SECONDS", 50) * 1000;
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 };
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_SCRIPT_BYTES = 25_000_000;

const LOCAL_BROWSERS: Record<string, string[]> = {
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
};

const serverless = () => !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const localBrowser = () => envString("CHROME_PATH") ?? (serverless() ? undefined : (LOCAL_BROWSERS[process.platform] ?? []).find((file) => fs.existsSync(file)));

/** Every browser this server could use, best first. On Linux without a browser (Vercel, Render, Docker) the downloadable Chromium pack is last. */
function availableProviders(): Provider[] {
  const list: Provider[] = [];
  if (envString("CLOUDFLARE_ACCOUNT_ID") && envString("CLOUDFLARE_API_TOKEN")) list.push("cloudflare");
  if (envString("BROWSER_WS_ENDPOINT")) list.push("remote");
  if (localBrowser()) list.push("local");
  else if (serverless() || (process.platform === "linux" && process.arch === "x64")) list.push("serverless");
  return list;
}

/** Whether deep scans can run here, which provider they use (and fall back to), and why not when they can't. */
export function deepScanStatus(): { enabled: boolean; provider: Provider | null; fallback: Provider | null; reason: string | null } {
  const flag = envString("DEEP_SCAN_ENABLED");
  if (flag === "false") return { enabled: false, provider: null, fallback: null, reason: "Deep scans are switched off on this server (DEEP_SCAN_ENABLED=false)." };
  const [provider = null, fallback = null] = availableProviders();
  if (!provider) return { enabled: false, provider: null, fallback: null, reason: "No browser is available. Install Chrome, set CHROME_PATH or BROWSER_WS_ENDPOINT." };
  // In production a deep scan costs real compute, so it has to be switched on explicitly.
  if (process.env.NODE_ENV === "production" && flag !== "true") return { enabled: false, provider, fallback, reason: "Deep scans are off on this deployment. Set DEEP_SCAN_ENABLED=true to turn them on." };
  return { enabled: true, provider, fallback, reason: null };
}

/**
 * Opens the preferred browser. When Cloudflare can't take the scan (daily free minutes used up, all 3 free browsers
 * busy, an outage), the next provider takes over, so visitors aren't blocked by the quota.
 */
async function openWithFallback(status: { provider: Provider; fallback: Provider | null }, log: Log): Promise<{ browser: Browser; provider: Provider }> {
  try {
    return { browser: await openBrowser(status.provider, log), provider: status.provider };
  } catch (error) {
    if (!status.fallback) throw error;
    log(`${error instanceof Error ? error.message : "The browser could not start"} Using the ${status.fallback} browser instead.`, "warn");
    return { browser: await openBrowser(status.fallback, log), provider: status.fallback };
  }
}

async function openBrowser(provider: Provider, log: Log): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  if (provider === "cloudflare") {
    log("Connecting to Cloudflare Browser Run");
    // keep_alive: the session closes itself 60 s after we stop talking to it, so a crashed scan can't burn browser time.
    const endpoint = `wss://api.cloudflare.com/client/v4/accounts/${envString("CLOUDFLARE_ACCOUNT_ID")}/browser-rendering/devtools/browser?keep_alive=60000`;
    try {
      return await puppeteer.connect({ browserWSEndpoint: endpoint, headers: { Authorization: `Bearer ${envString("CLOUDFLARE_API_TOKEN")}` }, defaultViewport: VIEWPORT, protocolTimeout: 20_000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/429|quota|limit/i.test(message)) throw new Error("Cloudflare Browser Run is at its limit (the free plan allows 10 browser-minutes a day and 3 browsers at once).");
      if (/401|403/.test(message)) throw new Error("Cloudflare refused the browser connection: check CLOUDFLARE_ACCOUNT_ID and that the API token has the Browser Rendering - Edit permission.");
      throw new Error(`Could not start a browser on Cloudflare: ${message.split("\n")[0]}`);
    }
  }
  if (provider === "remote") {
    log("Connecting to the remote browser");
    return puppeteer.connect({ browserWSEndpoint: envString("BROWSER_WS_ENDPOINT")!, defaultViewport: VIEWPORT, protocolTimeout: 20_000 });
  }
  const common = ["--mute-audio", "--no-first-run", "--disable-extensions", "--disable-background-networking", "--disable-sync", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--hide-scrollbars"];
  if (provider === "local") {
    log("Starting the local browser");
    return puppeteer.launch({ executablePath: localBrowser()!, headless: true, defaultViewport: VIEWPORT, args: [...common, "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], protocolTimeout: 20_000 });
  }
  const chromium = (await import("@sparticuz/chromium-min")).default;
  const pack = envString("CHROMIUM_PACK_URL") ?? DEFAULT_PACK;
  const cold = !fs.existsSync("/tmp/chromium");
  log(cold ? "Cold start: downloading and unpacking Chromium (once per server instance)" : "Starting Chromium");
  return puppeteer.launch({
    executablePath: await chromium.executablePath(pack),
    headless: "shell",
    defaultViewport: VIEWPORT,
    args: [...chromium.args, ...common],
    protocolTimeout: 20_000,
  });
}

/** One scan at a time per server instance: Chromium needs most of a small function's memory. */
let busy = false;

/** Resolves a host once per scan and refuses private, loopback, link-local and metadata addresses. */
function hostGuard() {
  const cache = new Map<string, Promise<boolean>>();
  return (host: string) => {
    if (!cache.has(host)) {
      cache.set(host, (async () => {
        if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") return false;
        if (process.env.SCANNER_ALLOW_PRIVATE_HOSTS === "true") return true;
        try {
          const addresses = await dns.lookup(host, { all: true, verbatim: true });
          return addresses.length > 0 && !addresses.some((item) => isPrivateAddress(item.address));
        } catch { return false; }
      })());
    }
    return cache.get(host)!;
  };
}

const assetKind = (url: string): { group: "3d" | "media" | "vector" | null; kind: string } => {
  const path = url.split("?")[0].toLowerCase();
  const ext = /\.([a-z0-9]+)$/.exec(path)?.[1] ?? "";
  if (["glb", "gltf", "fbx", "obj", "usdz", "hdr", "exr", "ktx2", "basis", "drc", "splat", "ply", "spz"].includes(ext)) return { group: "3d", kind: ext.toUpperCase() };
  if (["mp4", "webm", "mov", "m3u8", "mp3", "ogg", "wav", "m4a"].includes(ext)) return { group: "media", kind: ext.toUpperCase() };
  if (["riv", "lottie"].includes(ext) || /lottie|bodymovin/.test(path) && ext === "json") return { group: "vector", kind: ext === "json" ? "LOTTIE" : ext.toUpperCase() };
  return { group: null, kind: ext };
};

interface Tracked { url: string; type: string; bytes: number }

export interface RenderOptions {
  /** An extra in-page script (a plain JS expression) run after scrolling; its JSON result is returned as `extra`. */
  probe?: string;
  /** The second load with "reduce motion" on (default true). Skipping it saves about a third of the browser time. */
  reducedMotion?: boolean;
  /** Screenshots while scrolling (default true); the first screen is always kept. */
  scrollShots?: boolean;
}

/** Renders `url` and returns what the page did. Never throws for page problems; throws only when no browser can start. */
export async function renderSite(url: string, log: Log, signal?: AbortSignal, options: RenderOptions = {}): Promise<{ runtime: RuntimeReport; techs: Tech[]; scriptUrls: string[]; html: string; scripts: { url: string; text: string }[]; extra: unknown }> {
  const status = deepScanStatus();
  if (!status.enabled || !status.provider) throw new Error(status.reason ?? "Deep scans are not available.");
  if (busy) throw new Error("Another deep scan is running on this server. Try again in a minute.");
  busy = true;
  const started = Date.now();
  const deadline = started + BUDGET_MS;
  const remaining = () => deadline - Date.now();
  const allowed = hostGuard();
  const pageApex = apexDomain(new URL(url).hostname);
  const requests = new Map<string, Tracked>();
  const scripts: { url: string; text: string }[] = [];
  const styles: { url: string; text: string }[] = [];
  let scriptBytes = 0;
  let blockedCount = 0;
  const media: RuntimeAsset[] = [];
  const runtime: RuntimeReport = {
    finalUrl: url, provider: status.provider, startedAt: new Date().toISOString(), durationMs: 0, partial: false, blocked: null, globals: [],
    network: { requests: 0, transferBytes: 0, byType: [], thirdParty: [], lazyScripts: 0, assets3d: [], media: [], vector: [], blocked: 0 },
    fonts: [], typeScale: [], webgl: { contexts: [], shaders: 0, shaderSamples: [], drawCalls: 0, webgpu: false },
    animations: { total: 0, running: 0, css: 0, transitions: 0, scripted: 0, names: [] },
    scroll: { library: null, container: null, virtual: false, wheelListeners: 0, pageHeight: 0 },
    reducedMotion: { tested: false, normalRunning: 0, reducedRunning: 0, smoothScrollDisabled: null, respects: null },
    vitals: { fcp: null, lcp: null, cls: null, longTasks: 0, totalBlockingTime: 0, domContentLoaded: null, load: null, jsHeapMB: null },
    screenshots: [],
  };
  let browser: Browser | null = null;
  let renderedHtml = "";
  let extra: unknown = null;
  // Cancelling closes the browser at once: the scan stops and nothing it saw is kept.
  const onAbort = () => { void browser?.close().catch(() => {}); };
  signal?.addEventListener("abort", onAbort);
  try {
    signal?.throwIfAborted();
    const opened = await openWithFallback({ provider: status.provider, fallback: status.fallback }, log);
    browser = opened.browser;
    runtime.provider = opened.provider;
    if (signal?.aborted) throw new Error("The deep scan was cancelled.");
    // Browsers we launch are new for every scan, so their default context is already clean. Connected browsers get a fresh
    // incognito context (falling back to the default one). The serverless Chromium runs with --single-process, where
    // creating a second context crashes the browser ("Target.createTarget: Target closed").
    const launched = opened.provider === "local" || opened.provider === "serverless";
    const context = launched ? browser.defaultBrowserContext() : await browser.createBrowserContext().catch(() => browser!.defaultBrowserContext());
    const page = await context.newPage();
    await page.setUserAgent({ userAgent: USER_AGENT });
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    const client = await page.createCDPSession();
    await client.send("Browser.setDownloadBehavior", { behavior: "deny" }).catch(() => {});
    await instrument(page, client, { allowed, requests, scripts, styles, media, onScriptBytes: (n) => { scriptBytes += n; return scriptBytes < MAX_SCRIPT_BYTES; }, onBlocked: () => { blockedCount++; } });
    await page.evaluateOnNewDocument(INSTALL_PROBES);

    // ── Load ──
    log(`Rendering ${url}`);
    let response = null;
    try {
      response = await page.goto(url, { waitUntil: "load", timeout: Math.max(5000, Math.min(25_000, remaining() - 20_000)) });
    } catch (error) {
      log(`The page did not finish loading in time (${error instanceof Error ? error.message.split("\n")[0] : "timeout"}); reading what rendered`, "warn");
      runtime.partial = true;
    }
    runtime.finalUrl = page.url();
    if (response && [401, 403, 429, 503].includes(response.status())) {
      const body = await response.text().catch(() => "");
      const message = blockedMessage(new Response(body, { status: response.status(), headers: response.headers() }), body);
      if (/bot protection|refused/.test(message)) { runtime.blocked = message.split(". Enter")[0] + "."; log(runtime.blocked, "warn"); }
    }
    await settle(page, Math.min(2500, remaining() - 15_000));
    const before = await page.evaluate(COUNT_RUNNING).catch(() => null) as { running: number; smooth: boolean } | null;
    runtime.reducedMotion.normalRunning = before?.running ?? 0;
    const loadVitals = await page.evaluate(VITALS).catch(() => null) as { lcp: number | null; cls: number; longTasks: number; tbt: number } | null;
    if (remaining() > 12_000) runtime.screenshots.push({ label: "First screen", src: await shot(page) });

    // ── Scroll like a visitor (real wheel events, so smooth-scroll libraries react) ──
    if (!runtime.blocked && remaining() > 14_000) {
      log("Scrolling through the page");
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2).catch(() => {});
      for (let step = 1; step <= 3 && remaining() > 10_000; step++) {
        for (let tick = 0; tick < 6; tick++) { await page.mouse.wheel({ deltaY: 160 }).catch(() => {}); await sleep(60); }
        await sleep(900);
        if (options.scrollShots !== false) runtime.screenshots.push({ label: `Scroll ${step}`, src: await shot(page) });
      }
    }

    // ── Collect ──
    if (remaining() > 3000) {
      const collected = await Promise.race([page.evaluate(COLLECT), sleep(Math.max(1000, remaining() - 2000)).then(() => null)]) as Omit<RuntimeReport, "finalUrl" | "provider" | "startedAt" | "durationMs" | "partial" | "blocked" | "network" | "reducedMotion" | "screenshots"> | null;
      if (collected) Object.assign(runtime, collected);
      if (collected && loadVitals) runtime.vitals = { ...runtime.vitals, lcp: loadVitals.lcp ?? runtime.vitals.lcp, cls: loadVitals.cls, longTasks: loadVitals.longTasks, totalBlockingTime: loadVitals.tbt };
      else runtime.partial = true;
      renderedHtml = await page.content().catch(() => "");
      if (options.probe && remaining() > 2000) extra = await Promise.race([page.evaluate(options.probe), sleep(Math.max(1000, remaining() - 1500)).then(() => null)]).catch(() => null);
    } else runtime.partial = true;

    // ── Reduced motion: load again with prefers-reduced-motion: reduce and compare ──
    if (options.reducedMotion !== false && !runtime.blocked && remaining() > 14_000) {
      log("Loading again with “reduce motion” turned on");
      const reduced = await context.newPage();
      await reduced.setUserAgent({ userAgent: USER_AGENT });
      await reduced.setRequestInterception(true);
      reduced.on("request", (request) => {
        const target = request.url();
        if (!/^https?:/.test(target)) { void (target.startsWith("data:") || target.startsWith("blob:") ? request.continue() : request.abort("blockedbyclient")); return; }
        if (["media", "image"].includes(request.resourceType())) { void request.abort("blockedbyclient"); return; }
        void allowed(new URL(target).hostname).then((ok) => (ok ? request.continue() : request.abort("addressunreachable"))).catch(() => {});
      });
      await reduced.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await reduced.evaluateOnNewDocument(INSTALL_PROBES);
      try {
        await reduced.goto(url, { waitUntil: "load", timeout: Math.max(4000, remaining() - 6000) });
        await settle(reduced, Math.min(2500, remaining() - 3000));
        const after = await reduced.evaluate(COUNT_RUNNING) as { running: number; smooth: boolean };
        runtime.reducedMotion = {
          tested: true,
          normalRunning: before?.running ?? 0,
          reducedRunning: after.running,
          smoothScrollDisabled: before?.smooth ? !after.smooth : null,
          respects: (before?.running ?? 0) === 0 && !before?.smooth ? null : after.running < Math.max(1, (before?.running ?? 0) * 0.5) || (before?.smooth === true && !after.smooth),
        };
      } catch { /* the second load is optional */ }
      await reduced.close().catch(() => {});
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await browser?.close().catch(() => {});
    busy = false;
  }
  if (signal?.aborted) throw new Error("The deep scan was cancelled.");

  // ── Network summary ──
  const tracked = [...requests.values()];
  const byType = new Map<string, { type: string; count: number; bytes: number }>();
  const hosts = new Map<string, { host: string; count: number; bytes: number }>();
  for (const item of tracked) {
    const type = byType.get(item.type) ?? { type: item.type, count: 0, bytes: 0 };
    type.count++; type.bytes += item.bytes; byType.set(item.type, type);
    const host = new URL(item.url).hostname;
    if (host !== pageApex && !host.endsWith(`.${pageApex}`)) {
      const entry = hosts.get(host) ?? { host, count: 0, bytes: 0 };
      entry.count++; entry.bytes += item.bytes; hosts.set(host, entry);
    }
    const asset = assetKind(item.url);
    if (asset.group === "3d") runtime.network.assets3d.push({ url: item.url, kind: asset.kind, bytes: item.bytes });
    if (asset.group === "vector") runtime.network.vector.push({ url: item.url, kind: asset.kind, bytes: item.bytes });
  }
  runtime.network.requests = tracked.length;
  runtime.network.transferBytes = tracked.reduce((sum, item) => sum + item.bytes, 0);
  runtime.network.byType = [...byType.values()].sort((a, b) => b.bytes - a.bytes);
  runtime.network.thirdParty = [...hosts.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 25);
  runtime.network.media = [...new Map(media.map((item) => [item.url, item])).values()].slice(0, 20);
  runtime.network.assets3d = runtime.network.assets3d.slice(0, 30);
  runtime.network.vector = runtime.network.vector.slice(0, 30);
  runtime.network.blocked = blockedCount;

  // Signatures over everything the page actually loaded, plus the rendered DOM.
  const { techs } = detect({ html: renderedHtml, urls: tracked.map((item) => item.url), js: scripts, css: styles, headers: {}, cookies: [], meta: {} }, new URL(url).hostname);
  runtime.durationMs = Date.now() - started;
  log(`Rendered in ${(runtime.durationMs / 1000).toFixed(1)} s: ${runtime.network.requests} requests, ${runtime.globals.length} runtime libraries, ${runtime.webgl.contexts.length} WebGL context${runtime.webgl.contexts.length === 1 ? "" : "s"}`, "ok");
  return { runtime, techs, html: renderedHtml, scripts, extra, scriptUrls:tracked.filter((item) => item.type === "script").map((item) => item.url.split("#")[0]) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/** Waits for the network to go quiet, up to `ms`. */
async function settle(page: Page, ms: number) {
  if (ms <= 0) return;
  await page.waitForNetworkIdle({ idleTime: 500, timeout: ms }).catch(() => {});
}

async function shot(page: Page): Promise<string> {
  try {
    const data = await page.screenshot({ type: "jpeg", quality: 50, encoding: "base64", captureBeyondViewport: false });
    return `data:image/jpeg;base64,${data}`;
  } catch {
    return "";
  }
}

async function instrument(page: Page, client: CDPSession, state: {
  allowed: (host: string) => Promise<boolean>;
  requests: Map<string, Tracked>;
  scripts: { url: string; text: string }[];
  styles: { url: string; text: string }[];
  media: RuntimeAsset[];
  onScriptBytes: (bytes: number) => boolean;
  onBlocked: () => void;
}) {
  // Transfer sizes come from the protocol (encodedDataLength); puppeteer's Response does not expose them.
  await client.send("Network.enable");
  const byId = new Map<string, { url: string; type: string }>();
  client.on("Network.responseReceived", (event) => { byId.set(event.requestId, { url: event.response.url, type: String(event.type ?? "Other").toLowerCase() }); });
  client.on("Network.loadingFinished", (event) => {
    const info = byId.get(event.requestId);
    if (!info || !/^https?:/.test(info.url)) return;
    state.requests.set(event.requestId, { url: info.url, type: info.type, bytes: event.encodedDataLength });
  });

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const target = request.url();
    if (target.startsWith("data:") || target.startsWith("blob:")) { void request.continue().catch(() => {}); return; }
    if (!/^https?:/.test(target)) { state.onBlocked(); void request.abort("blockedbyclient").catch(() => {}); return; }
    // Videos and audio are listed but not downloaded: they are large and say nothing about how the site is built.
    if (request.resourceType() === "media" && !request.isNavigationRequest()) {
      state.media.push({ url: target, kind: assetKind(target).kind.toUpperCase() || "MEDIA", bytes: 0 });
      void request.abort("blockedbyclient").catch(() => {});
      return;
    }
    void state.allowed(new URL(target).hostname).then((ok) => {
      if (ok) return request.continue();
      state.onBlocked();
      return request.abort("addressunreachable");
    }).catch(() => {});
  });
  page.on("response", (response) => {
    const type = response.request().resourceType();
    if (type !== "script" && type !== "stylesheet") return;
    const length = Number(response.headers()["content-length"] ?? 0);
    if (length > 6_000_000) return;
    void response.text().then((text) => {
      if (type === "stylesheet") { if (state.styles.length < 40) state.styles.push({ url: response.url(), text }); return; }
      if (state.onScriptBytes(text.length)) state.scripts.push({ url: response.url(), text });
    }).catch(() => {});
  });
}

