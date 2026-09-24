export type IdKind = "GTM" | "GA4" | "GT" | "META" | "SEGMENT";

export const ID_PATTERNS: Record<IdKind, RegExp> = {
  GTM: /^GTM-[A-Z0-9]{4,12}$/,
  GA4: /^G-[A-Z0-9]{4,15}$/,
  GT: /^GT-[A-Z0-9]{4,15}$/,
  META: /^\d{10,20}$/,
  // Segment write keys: 20–40 letters and digits, always mixed (all digits would be a Meta pixel). Case-sensitive.
  SEGMENT: /^(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{20,40}$/,
};

/** Google IDs are case-insensitive and shown in upper case; Segment write keys must keep their case. */
export function normalizeId(value: string): string {
  const id = value.trim();
  return /^(GTM|GT|G)-/i.test(id) ? id.toUpperCase() : id;
}

export function idKind(value: string): IdKind | null {
  const id = normalizeId(value);
  for (const [kind, pattern] of Object.entries(ID_PATTERNS) as [IdKind, RegExp][]) if (pattern.test(id)) return kind;
  return null;
}

export type ParsedInput = { type: "id"; id: string; kind: IdKind } | { type: "url"; url: string };

export function parseInput(raw: string): ParsedInput {
  const input = raw.trim();
  if (!input || input.length > 2048) throw new Error("Enter an ID or a website URL.");
  const kind = idKind(input);
  if (kind) return { type: "id", id: normalizeId(input), kind };
  if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^https?:\/\//i.test(input)) throw new Error("Only http and https URLs are supported.");
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error("That doesn't look like a valid ID or website URL.");
  }
  if (!url.hostname.includes(".") || url.username || url.password) throw new Error("That doesn't look like a valid ID or website URL.");
  url.hash = "";
  return { type: "url", url: url.toString() };
}

/** All Google tag IDs mentioned in a piece of text. */
export function findIds(text: string): { gtm: string[]; ga4: string[]; gt: string[]; aw: string[] } {
  const pick = (pattern: RegExp) => [...new Set((text.match(pattern) ?? []).map((id) => id.toUpperCase()))];
  return {
    gtm: pick(/\bGTM-[A-Z0-9]{4,12}\b/gi),
    ga4: pick(/\bG-[A-Z0-9]{6,15}\b/g),
    gt: pick(/\bGT-[A-Z0-9]{6,15}\b/g),
    aw: pick(/\bAW-\d{6,15}\b/g),
  };
}

/** Turns escaped quotes (', \x27, \", \') inside compiled JavaScript into plain double quotes. */
const unescapeQuotes = (text: string) => text.replace(/\\u0027|\\x27|\\u0022|\\x22|\\"|\\'/g, '"');

/**
 * Meta Pixel IDs in page source or a GTM container, in order of appearance: fbq('init', …), the
 * facebook.com/tr noscript image, and pixelId fields of Meta tag templates. Escaped quotes are normalized first.
 */
export function findPixelIds(text: string): string[] {
  const normalized = unescapeQuotes(text);
  const patterns = [/fbq\(\s*["']init["']\s*,\s*["']?(\d{10,20})/g, /facebook\.com\/tr\/?\?(?:[^"'\s]*&(?:amp;)?)?id=(\d{10,20})/g, /pixel_?id["']?\s*[:=]\s*["'](\d{10,20})["']/gi];
  const found = patterns.flatMap((pattern) => [...normalized.matchAll(pattern)].map((match) => ({ id: match[1], at: match.index! })));
  return [...new Set(found.sort((a, b) => a.at - b.at).map((item) => item.id))];
}

/**
 * Segment write keys in page source, first-party scripts or a GTM container: the CDN snippet URL,
 * analytics.load("…"), writeKey fields, and load(variable) where the variable is assigned the key.
 */
export function findSegmentKeys(text: string): string[] {
  const normalized = unescapeQuotes(text);
  const patterns = [
    /cdn\.segment\.(?:com|io)\/analytics\.js\/v1\/([A-Za-z0-9]{20,40})/g,
    /analytics\.load\(\s*["']([A-Za-z0-9]{20,40})["']/g,
    /(?:_?write_?key|segment\w*key)["']?\s*[:=]\s*["']([A-Za-z0-9]{20,40})["']/gi,
  ];
  const found = patterns.flatMap((pattern) => [...normalized.matchAll(pattern)].map((match) => ({ id: match[1], at: match.index! })));
  // analytics.load(segmentKey) → var segmentKey = "…"
  for (const match of normalized.matchAll(/analytics\.load\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g)) {
    const variable = match[1].replace(/\$/g, "\\$");
    const assigned = new RegExp(`\\b${variable}\\s*=\\s*["']([A-Za-z0-9]{20,40})["']`).exec(normalized);
    if (assigned) found.push({ id: assigned[1], at: assigned.index });
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((item) => item.id))].filter((id) => ID_PATTERNS.SEGMENT.test(id));
}
