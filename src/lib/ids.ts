export type IdKind = "GTM" | "GA4" | "GT";

export const ID_PATTERNS: Record<IdKind, RegExp> = {
  GTM: /^GTM-[A-Z0-9]{4,12}$/,
  GA4: /^G-[A-Z0-9]{4,15}$/,
  GT: /^GT-[A-Z0-9]{4,15}$/,
};

export function idKind(value: string): IdKind | null {
  const id = value.trim().toUpperCase();
  for (const [kind, pattern] of Object.entries(ID_PATTERNS) as [IdKind, RegExp][]) if (pattern.test(id)) return kind;
  return null;
}

export type ParsedInput = { type: "id"; id: string; kind: IdKind } | { type: "url"; url: string };

export function parseInput(raw: string): ParsedInput {
  const input = raw.trim();
  if (!input || input.length > 2048) throw new Error("Enter an ID or a website URL.");
  const kind = idKind(input);
  if (kind) return { type: "id", id: input.toUpperCase(), kind };
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
