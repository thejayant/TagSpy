import { SIGNATURES, type Signature } from "./signatures";
import type { Evidence, Tech, TechCategory } from "./types";

export interface DetectInputs {
  html: string;
  urls: string[];
  js: { url: string; text: string }[];
  css: { url: string; text: string }[];
  /** Response headers, names in lower case. */
  headers: Record<string, string>;
  cookies: string[];
  /** <meta name|property> → content, names in lower case. */
  meta: Record<string, string>;
}

export const CATEGORY_ORDER: TechCategory[] = [
  "Meta-framework", "Framework", "Site builder", "CMS", "Headless CMS", "E-commerce", "Build tool", "Language", "JavaScript library",
  "UI framework", "Component library", "CSS", "Icons", "Carousel",
  "Animation", "Smooth scroll", "Page transitions", "3D & WebGL", "Vector animation", "Creative coding",
  "Hosting", "CDN", "Web server", "Backend", "Security", "Auth", "Payments", "Search", "Media", "Font service",
  "Tag management", "Analytics", "Advertising", "Monitoring", "Consent", "Customer support",
];

const MAX_EVIDENCE = 4;

/** The matched text with some context, on one line. */
export function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 36);
  const end = Math.min(text.length, index + length + 36);
  const body = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${body.length > 160 ? `${body.slice(0, 160)}…` : body}${end < text.length ? "…" : ""}`;
}

/** Short display form of a URL: the path for first-party files, host + path otherwise. */
export function shortUrl(url: string, pageHost?: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.length > 70 ? `${parsed.pathname.slice(0, 34)}…${parsed.pathname.slice(-30)}` : parsed.pathname;
    return parsed.hostname === pageHost ? path : `${parsed.hostname}${path}`;
  } catch {
    return url.slice(0, 80);
  }
}

interface Hit { evidence: Evidence[]; version: string | null; files: Set<string> }

function scan(signature: Signature, inputs: DetectInputs, pageHost: string): Hit | null {
  const hit: Hit = { evidence: [], version: null, files: new Set() };
  const matched: string[] = [];
  const take = (pattern: RegExp, text: string, where: string, file?: string): boolean => {
    const match = pattern.exec(text);
    if (!match) return false;
    if (hit.evidence.length < MAX_EVIDENCE) hit.evidence.push({ where, match: snippet(text, match.index, match[0].length) });
    if (!hit.version && match[1] && /^\d/.test(match[1])) hit.version = match[1];
    if (file) hit.files.add(file);
    matched.push(text);
    return true;
  };

  for (const pattern of signature.html ?? []) if (take(pattern, inputs.html, "HTML")) break;
  for (const [name, pattern] of signature.meta ?? []) if (inputs.meta[name] !== undefined) take(pattern, inputs.meta[name], `<meta name="${name}">`);
  for (const [name, pattern] of signature.headers ?? []) if (inputs.headers[name] !== undefined) take(pattern, inputs.headers[name], `header ${name}`);
  for (const pattern of signature.cookies ?? []) for (const cookie of inputs.cookies) if (pattern.test(cookie)) { if (hit.evidence.length < MAX_EVIDENCE) hit.evidence.push({ where: "cookie", match: cookie }); matched.push(cookie); break; }
  for (const pattern of signature.url ?? []) {
    for (const url of inputs.urls) {
      const match = pattern.exec(url);
      if (!match) continue;
      if (hit.evidence.length < MAX_EVIDENCE) hit.evidence.push({ where: "file URL", match: shortUrl(url, pageHost) });
      if (!hit.version && match[1] && /^\d/.test(match[1])) hit.version = match[1];
      hit.files.add(url);
      matched.push(url);
      break;
    }
  }
  if (signature.js) for (const file of inputs.js) for (const pattern of signature.js) if (take(pattern, file.text, shortUrl(file.url, pageHost), file.url)) break;
  if (signature.css) for (const file of inputs.css) for (const pattern of signature.css) if (take(pattern, file.text, file.url ? shortUrl(file.url, pageHost) : "inline <style>", file.url || undefined)) break;

  if (!hit.evidence.length) return null;
  if (!hit.version && signature.version) {
    const texts = [...new Set(matched)];
    outer: for (const pattern of signature.version) for (const text of texts) {
      const version = pattern.exec(text)?.slice(1).find((item) => item && /^\d/.test(item));
      if (version) { hit.version = version; break outer; }
    }
  }
  return hit;
}

/** Runs every signature over the page's public inputs; returns technologies and which files each was seen in. */
export function detect(inputs: DetectInputs, pageHost: string): { techs: Tech[]; files: Map<string, string[]> } {
  const found = new Map<string, Tech>();
  const files = new Map<string, string[]>();
  for (const signature of SIGNATURES) {
    const hit = scan(signature, inputs, pageHost);
    if (!hit) continue;
    found.set(signature.name, {
      name: signature.name, category: signature.category, version: hit.version, confidence: signature.confidence ?? "high",
      description: signature.description, website: signature.website ?? null, color: signature.color ?? null, evidence: hit.evidence, implied: false,
    });
    for (const file of hit.files) files.set(file, [...(files.get(file) ?? []), signature.name]);
  }
  // Implied technologies (Next.js → React → …), resolved until nothing new appears.
  const bySignature = new Map(SIGNATURES.map((signature) => [signature.name, signature]));
  for (let changed = true; changed;) {
    changed = false;
    for (const tech of [...found.values()]) {
      for (const name of bySignature.get(tech.name)?.implies ?? []) {
        if (found.has(name)) continue;
        const signature = bySignature.get(name);
        if (!signature) continue;
        found.set(name, {
          name, category: signature.category, version: null, confidence: tech.confidence === "high" ? "medium" : "low", description: signature.description,
          website: signature.website ?? null, color: signature.color ?? null, evidence: [{ where: "implied", match: `${tech.name} uses ${name}` }], implied: true,
        });
        changed = true;
      }
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  const techs = [...found.values()].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || rank[a.confidence] - rank[b.confidence] || a.name.localeCompare(b.name));
  return { techs, files };
}
