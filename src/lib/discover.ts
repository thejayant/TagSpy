import { fetchPublic } from "./fetcher";
import { findIds } from "./ids";
import { safeFetch } from "./url-safety";

export interface FoundId {
  id: string;
  kind: "GTM" | "GA4" | "GT";
  via: string;
}

type Log = (text: string) => void;

const PAGE_BYTES = 3_000_000;
const SCRIPT_BYTES = 1_500_000;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.8",
};

const DIRECT_ID_HINT = "Enter the container or measurement ID directly instead (find it in the page source, or with Google Tag Assistant).";

/** Explains non-OK page responses, recognizing bot-protection challenges we cannot (and should not) pass. */
function blockedMessage(response: Response, body: string): string {
  const header = (name: string) => response.headers.get(name)?.toLowerCase() ?? "";
  const server = header("server");
  const vendor = header("cf-mitigated") || server.includes("cloudflare") || /just a moment|cf-chl|challenges\.cloudflare\.com/i.test(body) ? "Cloudflare"
    : server.includes("akamai") || /akamai/i.test(body) ? "Akamai"
    : /datadome/i.test(body) || header("x-datadome") ? "DataDome"
    : /incapsula|imperva/i.test(body) ? "Imperva"
    : server.includes("sucuri") ? "Sucuri"
    : null;
  if (vendor && [403, 429, 503].includes(response.status)) {
    return `${new URL(response.url || "https://site").hostname || "This website"} is protected by ${vendor} bot protection, which blocks automated page reads (HTTP ${response.status}). ${DIRECT_ID_HINT}`;
  }
  if ([401, 403, 429].includes(response.status)) return `The website refused the request (HTTP ${response.status}); it may block automated or data-center traffic. ${DIRECT_ID_HINT}`;
  return `The website answered HTTP ${response.status}. ${DIRECT_ID_HINT}`;
}

/**
 * Finds the GTM containers and Google tags a website loads, by reading its HTML and a few of its
 * first-party scripts. Every URL (including redirects) is checked against private/reserved networks.
 */
export async function discoverIds(url: string, log: Log): Promise<FoundId[]> {
  const found = new Map<string, FoundId>();
  const add = (ids: ReturnType<typeof findIds>, via: string) => {
    for (const id of ids.gtm) if (!found.has(id)) found.set(id, { id, kind: "GTM", via });
    for (const id of ids.ga4) if (!found.has(id)) found.set(id, { id, kind: "GA4", via });
    for (const id of ids.gt) if (!found.has(id)) found.set(id, { id, kind: "GT", via });
  };

  log(`GET ${url}`);
  const page = await safeFetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) }, { redirects: 5, bytes: PAGE_BYTES });
  if (!page.response.ok) throw new Error(blockedMessage(page.response, page.body));
  const finalUrl = page.finalUrl;
  if (finalUrl !== url) log(`Redirected to ${finalUrl}`);
  log(`Read ${Math.round(page.body.length / 1024)} KB of HTML`);
  add(findIds(page.body), "page HTML");

  if (!found.size) {
    const origin = new URL(finalUrl);
    const scripts = [...page.body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map((match) => { try { return new URL(match[1], finalUrl); } catch { return null; } })
      .filter((item): item is URL => !!item && item.hostname.endsWith(origin.hostname.replace(/^www\./, "")))
      .slice(0, 6);
    for (const script of scripts) {
      try {
        log(`Scanning script ${script.pathname}`);
        const result = await safeFetch(script.toString(), { headers: HEADERS, signal: AbortSignal.timeout(10_000) }, { redirects: 3, bytes: SCRIPT_BYTES });
        add(findIds(result.body), `script ${script.pathname}`);
      } catch {
        /* one unreachable script should not stop discovery */
      }
    }
  }
  return [...found.values()];
}

/** IDs referenced in page source the user copied from their own browser (for sites that block automated reads). */
export function idsFromSource(html: string, via = "pasted page source"): FoundId[] {
  const ids = findIds(html);
  return [
    ...ids.gtm.map((id) => ({ id, kind: "GTM" as const, via })),
    ...ids.ga4.map((id) => ({ id, kind: "GA4" as const, via })),
    ...ids.gt.map((id) => ({ id, kind: "GT" as const, via })),
  ];
}

/** GA4 measurement IDs configured inside GTM containers (Google tag / GA4 tags). */
export async function ga4IdsFromContainers(containers: string[], log: Log): Promise<FoundId[]> {
  const output: FoundId[] = [];
  for (const id of containers.slice(0, 4)) {
    try {
      log(`Opening container ${id} to look for GA4 tags`);
      const resource = await fetchPublic("gtm", id);
      const matches = [...resource.source.matchAll(/"vtp_(?:tagId|measurementIdOverride|measurementId)"\s*:\s*"(G-[A-Z0-9]{6,15})"/g)].map((match) => match[1]);
      for (const ga4 of new Set(matches)) output.push({ id: ga4, kind: "GA4", via: `container ${id}` });
    } catch (error) {
      log(`Could not read ${id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return output;
}
