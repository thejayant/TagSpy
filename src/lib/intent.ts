import { findIds, findPixelIds, findSegmentKeys, idKind, normalizeId, type IdKind } from "./ids";

/**
 * The omnibox's understanding of what someone typed: what it is (a website, a tag ID, pasted page source, or just a
 * question) and what they probably want to know about it. Everything runs locally as they type; nothing is sent
 * anywhere until they pick a suggestion.
 */

export type Tool = "ai" | "site" | "ga4" | "gtm" | "meta" | "segment";

export type Target =
  | { type: "site"; host: string; url: string; guessed: boolean }
  | { type: "id"; id: string; kind: IdKind }
  | { type: "source"; host: string | null; ids: { id: string; kind: IdKind }[] };

export interface Suggestion {
  tool: Tool;
  href: string;
  title: string;
  detail: string;
  /** Why this one was suggested, when the query said so ("you asked about fonts"). */
  reason: string | null;
  score: number;
}

export interface Understanding {
  target: Target | null;
  /** The question shown above the suggestions. */
  headline: string;
  /** What we recognised, for the chip in the input. */
  label: string | null;
  suggestions: Suggestion[];
  hint: string | null;
}

/** Words that reveal what someone wants to know. Longer phrases first so "built with ai" beats "built with". */
const INTENTS: { tool: Tool | "tracking"; words: string[] }[] = [
  { tool: "ai", words: ["built with ai", "made with ai", "made by ai", "ai generated", "ai-generated", "vibe coded", "vibe-coded", "vibecoded", "lovable", "bolt.new", "bolt", "v0", "replit", "cursor", "claude", "chatgpt", "gpt", "codex", "copilot", "windsurf", "base44", "emergent", "llm", "generated", "ai"] },
  { tool: "site", words: ["tech stack", "built with", "made with", "built on", "technology", "technologies", "framework", "stack", "cms", "fonts", "font", "typeface", "typography", "colours", "colors", "colour", "color", "palette", "design", "hosting", "hosted", "wordpress", "webflow", "framer", "shopify", "react", "next.js", "nextjs", "vue", "gsap", "animation", "animations", "three.js", "dns", "server"] },
  { tool: "ga4", words: ["google analytics", "key events", "measurement id", "conversions", "analytics", "events", "gtag", "consent", "ga4", "ga"] },
  { tool: "gtm", words: ["google tag manager", "tag manager", "data layer", "datalayer", "variables", "container", "triggers", "trigger", "tags", "gtm"] },
  { tool: "meta", words: ["conversions api", "advanced matching", "facebook pixel", "meta pixel", "facebook", "instagram", "pixel", "capi", "meta", "fb"] },
  { tool: "segment", words: ["write key", "destinations", "analytics.js", "segment", "cdp"] },
  { tool: "tracking", words: ["tracking", "trackers", "track", "marketing", "advertising", "ads", "cookies", "spy"] },
];

const TOOL_NAME: Record<Tool, string> = { ai: "AI Website Detector", site: "Site DNA", ga4: "GA4 Checker", gtm: "GTM Viewer", meta: "Meta Pixel Checker", segment: "Segment Inspector" };

/** Where a bare site lands before any hint: the free, unlimited tools first; the one-run AI check never by default. */
const SITE_BASE: Record<Tool, number> = { site: 50, ai: 44, gtm: 42, ga4: 40, meta: 36, segment: 30 };
const NOT_DOMAINS = /\.(?:js|ts|jsx|tsx|mjs|md|json|css|html?|png|jpe?g|svg)$/i;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, word: string) => new RegExp(`(?:^|[^a-z0-9])${escape(word)}(?:$|[^a-z0-9])`, "i").test(text);

/** A website mentioned anywhere in the text: "stripe.com", "https://x.dev/pricing", "is linear.app built with ai?". */
export function findSite(text: string): { host: string; url: string } | null {
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^[("'<]+|[)"'>,;:!?]+$|\.$/g, "");
    if (!token || NOT_DOMAINS.test(token.split(/[/?#]/)[0])) continue;
    const match = /^(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?::\d+)?(\/[^\s]*)?$/i.exec(token);
    if (!match) continue;
    const host = match[1].toLowerCase();
    const path = match[2] && match[2] !== "/" ? match[2] : "";
    return { host, url: `${host}${path}` };
  }
  return null;
}

/** Tag IDs typed on their own or inside a sentence ("open GTM-N233G8C"). */
function findId(text: string): { id: string; kind: IdKind } | null {
  for (const raw of text.split(/[\s,;]+/)) {
    const token = raw.replace(/^[("'<]+|[)"'>.:!?]+$/g, "");
    const kind = token.length >= 4 ? idKind(token) : null;
    if (kind) return { id: normalizeId(token), kind };
  }
  return null;
}

/** The intents a query expresses, with the words that gave each away. */
function intentsOf(text: string): Map<Tool, string[]> {
  const found = new Map<Tool, string[]>();
  let rest = ` ${text.toLowerCase()} `;
  for (const { tool, words } of INTENTS) {
    for (const word of words) {
      if (!has(rest, word)) continue;
      // A phrase is used once: "built with ai" should not also count as "built with".
      rest = rest.replace(new RegExp(escape(word), "gi"), " ");
      const targets: Tool[] = tool === "tracking" ? ["gtm", "ga4", "meta"] : [tool];
      for (const item of targets) found.set(item, [...(found.get(item) ?? []), word]);
    }
  }
  return found;
}

const siteSuggestion = (tool: Tool, site: { host: string; url: string }): Omit<Suggestion, "score" | "reason"> => {
  const q = encodeURIComponent(site.url);
  switch (tool) {
    case "ai": return { tool, href: `/ai-website-detector?url=${q}`, title: `Was ${site.host} built with AI?`, detail: "AI Website Detector · likelihood and evidence · you confirm the one free check" };
    case "site": return { tool, href: `/site?url=${q}`, title: `How is ${site.host} built?`, detail: "Site DNA · framework, fonts, colors, hosting" };
    case "ga4": return { tool, href: `/ga4?q=${q}`, title: `${site.host}'s Google Analytics 4 setup`, detail: "GA4 Checker · events, key events, consent" };
    case "gtm": return { tool, href: `/gtm?q=${q}`, title: `${site.host}'s Tag Manager container`, detail: "GTM Viewer · every tag, trigger and variable" };
    case "meta": return { tool, href: `/meta?q=${q}`, title: `${site.host}'s Meta Pixel`, detail: "Meta Pixel Checker · events, advanced matching, score" };
    case "segment": return { tool, href: `/segment?q=${q}`, title: `Where ${site.host} sends data with Segment`, detail: "Segment Inspector · destinations, consent, tracking plan" };
  }
};

const ID_TOOL: Record<IdKind, Tool> = { GTM: "gtm", GA4: "ga4", GT: "ga4", META: "meta", SEGMENT: "segment" };
const ID_NOUN: Record<IdKind, string> = { GTM: "Tag Manager container", GA4: "GA4 Measurement ID", GT: "Google tag ID", META: "Meta Pixel ID", SEGMENT: "Segment write key" };

function idSuggestions(id: string, kind: IdKind): Omit<Suggestion, "reason">[] {
  const q = encodeURIComponent(id);
  if (kind === "GTM") {
    return [
      { tool: "gtm", href: `/gtm?id=${q}`, title: `Open ${id}`, detail: "GTM Viewer · every tag, trigger and variable", score: 100 },
      { tool: "ga4", href: `/ga4?id=${q}`, title: `GA4 tags inside ${id}`, detail: "GA4 Checker · finds the Google tags this container loads", score: 70 },
      { tool: "meta", href: `/meta?id=${q}`, title: `Meta Pixels inside ${id}`, detail: "Meta Pixel Checker · finds pixels in the container", score: 60 },
      { tool: "segment", href: `/segment?id=${q}`, title: `Segment inside ${id}`, detail: "Segment Inspector · finds write keys in the container", score: 40 },
    ];
  }
  const tool = ID_TOOL[kind];
  const detail = { ga4: "GA4 Checker · events, key events, consent", meta: "Meta Pixel Checker · events, advanced matching, score", segment: "Segment Inspector · destinations, consent, tracking plan" }[tool as "ga4" | "meta" | "segment"];
  return [{ tool, href: `/${tool}?id=${q}`, title: `Open ${id}`, detail, score: 100 }];
}

/** Hosts that don't make sense to guess a ".com" for. */
const COMMON_WORDS = new Set(["the", "and", "what", "how", "is", "was", "does", "who", "why", "this", "that", "site", "website", "page", "check", "spy", "open", "find", "show", "me"]);

export function understand(raw: string): Understanding | null {
  const query = raw.trim();
  if (!query) return null;

  // ── Pasted page source: find every ID in it ──
  if (query.length > 150 && /<(?:!doctype|html|head|script|meta|body)\b/i.test(query)) {
    const google = findIds(query);
    const ids = [
      ...google.gtm.map((id) => ({ id, kind: "GTM" as const })),
      ...google.ga4.map((id) => ({ id, kind: "GA4" as const })),
      ...google.gt.map((id) => ({ id, kind: "GT" as const })),
      ...findPixelIds(query).map((id) => ({ id, kind: "META" as const })),
      ...findSegmentKeys(query).map((id) => ({ id, kind: "SEGMENT" as const })),
    ];
    const canonical = /<link[^>]+rel=["']canonical["'][^>]*href=["']https?:\/\/([^/"']+)/i.exec(query)?.[1] ?? /property=["']og:url["'][^>]*content=["']https?:\/\/([^/"']+)/i.exec(query)?.[1] ?? null;
    const suggestions: Suggestion[] = ids.slice(0, 6).map(({ id, kind }, index) => ({ ...idSuggestions(id, kind)[0], score: 100 - index, reason: null }));
    if (canonical) suggestions.push({ ...siteSuggestion("site", { host: canonical, url: canonical }), score: 50, reason: null });
    return {
      target: { type: "source", host: canonical, ids },
      label: "Page source",
      headline: ids.length ? `Found ${ids.length} tag ID${ids.length === 1 ? "" : "s"} in this page source. Which one?` : "No tag IDs in this page source.",
      suggestions,
      hint: ids.length ? null : "For a pasted page's technology stack, open Site DNA and use “Paste page source”.",
    };
  }

  // Read intent from the words around the address, never from the address itself ("mail.com" is not about "ai").
  const intents = intentsOf(query.split(/\s+/).filter((token) => !findSite(token) && !findId(token)).join(" "));
  const reasonFor = (tool: Tool) => { const words = intents.get(tool); return words?.length ? `You asked about “${words[0]}”` : null; };
  const rank = (items: Omit<Suggestion, "reason">[]): Suggestion[] =>
    items.map((item) => ({ ...item, score: item.score + (intents.has(item.tool) ? 100 + (intents.get(item.tool)!.length - 1) * 10 : 0), reason: reasonFor(item.tool) }))
      .sort((a, b) => b.score - a.score);

  // ── A tag ID ──
  const id = findId(query);
  if (id) {
    return { target: { type: "id", ...id }, label: ID_NOUN[id.kind], headline: `${id.id} is a ${ID_NOUN[id.kind]}.`, suggestions: rank(idSuggestions(id.id, id.kind)), hint: null };
  }

  // ── A website ──
  const site = findSite(query);
  if (site) {
    const suggestions = rank((Object.keys(SITE_BASE) as Tool[]).map((tool) => ({ ...siteSuggestion(tool, site), score: SITE_BASE[tool] })));
    const asked = suggestions[0].reason !== null;
    return { target: { type: "site", ...site, guessed: false }, label: site.host, headline: asked ? `Here's what we'll check on ${site.host}` : `What should we spy on ${site.host}?`, suggestions, hint: null };
  }

  // ── One word that could be a brand: offer its .com ──
  const word = query.toLowerCase();
  if (/^[a-z][a-z0-9-]{1,40}$/.test(word) && !COMMON_WORDS.has(word) && !intents.size) {
    const guess = { host: `${word}.com`, url: `${word}.com` };
    const suggestions = rank((Object.keys(SITE_BASE) as Tool[]).map((tool) => ({ ...siteSuggestion(tool, guess), score: SITE_BASE[tool] })));
    return { target: { type: "site", ...guess, guessed: true }, label: `${word}.com?`, headline: `Did you mean ${guess.host}?`, suggestions, hint: "Press Tab to use it, or type the full address." };
  }

  // ── Only a question: point at the right tools ──
  if (intents.size) {
    const tools = [...intents.keys()].sort((a, b) => intents.get(b)!.length - intents.get(a)!.length);
    const pages: Record<Tool, string> = { ai: "/ai-website-detector", site: "/site", ga4: "/ga4", gtm: "/gtm", meta: "/meta", segment: "/segment" };
    return {
      target: null, label: null,
      headline: "Which website should we look at?",
      suggestions: tools.map((tool, index) => ({ tool, href: pages[tool], title: `Open the ${TOOL_NAME[tool]}`, detail: "Add a website or an ID to go straight to the report", reason: reasonFor(tool), score: 100 - index })),
      hint: "Add a website like example.com to your search.",
    };
  }

  return { target: null, label: null, headline: "We couldn't tell what to look up.", suggestions: [], hint: "Enter a website like example.com, or an ID like GTM-XXXXXXX, G-XXXXXXXXXX or a pixel ID." };
}
