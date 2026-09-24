import { ID_PATTERNS } from "./ids";

const GOOGLE_HOST = "https://www.googletagmanager.com";
const MAX_BYTES = Number(process.env.MAX_RESPONSE_BYTES ?? 6_000_000);
const CACHE_MS = Number(process.env.CACHE_SECONDS ?? 300) * 1000;
const TIMEOUT_MS = 15_000;

export interface PublicResource {
  id: string;
  url: string;
  source: string;
  fetchedAt: string;
  cached: boolean;
}

const cache = new Map<string, { at: number; value: PublicResource }>();

export class NotPublishedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotPublishedError";
  }
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("The public response is larger than this server allows.");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Fetches the public, published configuration for a container (gtm.js) or Google tag (gtag/js).
 * Only googletagmanager.com is contacted and IDs are validated first, so this cannot be used to reach arbitrary hosts.
 */
export async function fetchPublic(kind: "gtm" | "gtag", rawId: string, options: { fresh?: boolean } = {}): Promise<PublicResource> {
  const id = rawId.trim().toUpperCase();
  const valid = kind === "gtm" ? ID_PATTERNS.GTM.test(id) : ID_PATTERNS.GA4.test(id) || ID_PATTERNS.GT.test(id) || /^AW-\d{6,15}$/.test(id);
  if (!valid) throw new Error(`"${rawId}" is not a valid ${kind === "gtm" ? "container" : "Google tag"} ID.`);
  const key = `${kind}:${id}`;
  const hit = cache.get(key);
  if (!options.fresh && hit && Date.now() - hit.at < CACHE_MS) return { ...hit.value, cached: true };

  const url = kind === "gtm" ? `${GOOGLE_HOST}/gtm.js?id=${encodeURIComponent(id)}` : `${GOOGLE_HOST}/gtag/js?id=${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; TagLens/2.0; +public-config-inspector)", Accept: "application/javascript, */*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 400) {
    throw new NotPublishedError(kind === "gtm" ? `${id} has no published container (Google returned ${response.status}).` : `Google has no public tag for ${id} (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(`Google responded with HTTP ${response.status} for ${id}.`);
  const source = await readLimited(response);
  if (!source.includes("var data")) throw new NotPublishedError(`The response for ${id} does not contain a published configuration.`);
  const value: PublicResource = { id, url, source, fetchedAt: new Date().toISOString(), cached: false };
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return value;
}
