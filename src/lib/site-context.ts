/**
 * What the visitor is currently investigating, shared between the GA4, Tag Manager, Meta Pixel and Segment pages so switching
 * modes carries the site and the IDs found so far. Kept per browser tab in sessionStorage.
 */
import { ID_PATTERNS, normalizeId } from "./ids";

export interface SiteContext { site?: string; ga4: string[]; gtm: string[]; meta: string[]; segment: string[] }

export type ContextMode = "ga4" | "gtm" | "meta" | "segment";
type Mode = ContextMode;
const KEY = "tagspy:context";
const EVENT = "tagspy:context";
const EMPTY: SiteContext = { ga4: [], gtm: [], meta: [], segment: [] };

const isId = (value: string) => /^(GTM|GT|G)-[A-Z0-9]+$/i.test(value.trim()) || /^\d{10,20}$/.test(value.trim()) || ID_PATTERNS.SEGMENT.test(value.trim());
const kindOf = (id: string): Mode => (/^GTM-/i.test(id) ? "gtm" : /^\d+$/.test(id) ? "meta" : ID_PATTERNS.SEGMENT.test(id) ? "segment" : "ga4");

export function readRaw(): string {
  try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; }
}

export function parseContext(raw: string): SiteContext {
  try { return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY; } catch { return EMPTY; }
}

function write(context: SiteContext) {
  try { sessionStorage.setItem(KEY, JSON.stringify(context)); } catch { /* storage unavailable: switching just starts fresh */ }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribe(notify: () => void): () => void {
  window.addEventListener(EVENT, notify);
  return () => window.removeEventListener(EVENT, notify);
}

/** A new search: a website starts a new investigation; an ID keeps the current one only if it belongs to it. */
export function rememberInput(input: string) {
  const value = input.trim();
  const current = parseContext(readRaw());
  if (!isId(value)) { write({ site: value, ga4: [], gtm: [], meta: [], segment: [] }); return; }
  const id = normalizeId(value);
  if (current.ga4.includes(id) || current.gtm.includes(id) || current.meta.includes(id) || current.segment.includes(id)) return;
  write({ ga4: [], gtm: [], meta: [], segment: [], [kindOf(id)]: [id] });
}

/** Adds IDs found by a result or a list of choices to the current investigation. */
export function rememberIds(ids: string[]) {
  const current = parseContext(readRaw());
  const next = { ...current, ga4: [...current.ga4], gtm: [...current.gtm], meta: [...current.meta], segment: [...current.segment] };
  for (const raw of ids) {
    const id = normalizeId(raw);
    const list = next[kindOf(id)];
    if (!list.includes(id)) list.push(id);
  }
  write(next);
}

/** Where the GA4 / Tag Manager switch should go: the one known ID, else the searched site, else the first ID. */
export function switchHref(target: Mode, context: SiteContext): string {
  const ids = context[target];
  if (ids.length === 1) return `/${target}?id=${encodeURIComponent(ids[0])}`;
  if (context.site) return `/${target}?q=${encodeURIComponent(context.site)}`;
  if (ids.length) return `/${target}?id=${encodeURIComponent(ids[0])}`;
  return `/${target}`;
}
