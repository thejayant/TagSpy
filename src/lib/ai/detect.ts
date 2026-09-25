import type { AiPageProbe } from "./probe";
import { AI_RULES, AI_TOOLS, COPY_CLICHES, type AiSource } from "./signatures";
import type { AiEvidence, AiReport, AiTier, AiToolId, AiToolScore } from "./types";

/** Everything the AI check read about a site. */
export interface AiCorpus {
  host: string;
  /** The HTML as served and as rendered. */
  html: string[];
  headers: Record<string, string>;
  urls: string[];
  js: { url: string; text: string }[];
  css: { url: string; text: string }[];
  /** Original source files embedded in public source maps. */
  maps: { url: string; text: string }[];
  probe: AiPageProbe | null;
  /** Agent instruction files served by the site, and marks found in its public repository. */
  found: AiEvidence[];
  /** Earliest Wayback Machine snapshot (ISO date), when known. */
  firstArchived: string | null;
  stack: string[];
}

/** Before any evidence, about one scanned site in seven is assumed to be AI-built. */
const PRIOR = 0.15;
/** ChatGPT's public launch: a site archived before it was made before AI builders existed. */
const CHATGPT = "2022-11-30";
/** Weak kinds of evidence can only move the needle so far, however many of them pile up. */
const TIER_CAP: Partial<Record<AiTier, number>> = { style: Math.log(3), content: Math.log(6), code: Math.log(14) };
/** Extra items in the same family count at this fraction: they usually restate the same fact. */
const ECHO = 0.35;

const CLASSIC_CMS = new Set(["WordPress", "Drupal", "Joomla", "Magento", "PrestaShop", "TYPO3", "Ghost", "Craft CMS", "HubSpot CMS"]);
const AI_CAPABLE_BUILDERS = new Set(["Framer", "Webflow", "Wix", "Squarespace", "Hostinger", "Durable", "10Web", "Duda"]);

const WHERE: Record<AiSource, string> = {
  html: "Page HTML", headers: "Response headers", host: "Web address", urls: "Files the page loads", js: "JavaScript", css: "CSS",
  maps: "Source map", text: "Visible page text", dom: "Rendered page",
};

const shortPath = (url: string) => {
  if (!url) return "Inline CSS";
  try { const parsed = new URL(url); return parsed.pathname.length > 1 ? parsed.pathname.split("/").slice(-2).join("/").slice(-60) : parsed.hostname; } catch { return url.slice(-60); }
};

/** The match with some context either side, on one line. */
function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + length + 48);
  const body = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${body.slice(0, 200)}${end < text.length ? "…" : ""}`;
}

/** The texts a source covers, each with a label for "where". */
function texts(corpus: AiCorpus, source: AiSource): { where: string; text: string }[] {
  switch (source) {
    case "html": return corpus.html.filter(Boolean).map((text, index) => ({ where: index === 0 ? "Page HTML" : "Rendered HTML", text }));
    case "headers": return [{ where: WHERE.headers, text: Object.entries(corpus.headers).map(([key, value]) => `${key}: ${value}`).join("\n") }];
    case "host": return [{ where: WHERE.host, text: corpus.host }];
    case "urls": return [{ where: WHERE.urls, text: corpus.urls.join("\n") }];
    case "js": return corpus.js.map((file) => ({ where: shortPath(file.url), text: file.text }));
    case "css": return corpus.css.map((file) => ({ where: shortPath(file.url), text: file.text }));
    case "maps": return corpus.maps.map((file) => ({ where: `Source map · ${file.url.replace(/^(?:webpack|vite):\/\/\/?/, "").slice(-60)}`, text: file.text }));
    case "text": return corpus.probe?.text ? [{ where: WHERE.text, text: corpus.probe.text }] : corpus.html[0] ? [{ where: WHERE.text, text: visibleText(corpus.html[0]) }] : [];
    case "dom": return corpus.probe ? [{ where: WHERE.dom, text: [...corpus.probe.attributes.map((item) => `${item.name}=${item.count}`), ...corpus.probe.badges, ...corpus.probe.comments].join("\n") }] : [];
  }
}

/** Rough visible text of static HTML, for when the page could not be rendered. */
export function visibleText(html: string): string {
  return html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").slice(0, 60000);
}

const clone = (pattern: RegExp, global: boolean) => new RegExp(pattern.source, pattern.flags.replace("g", "") + (global ? "g" : ""));

/** Runs every rule over the corpus. One evidence item per rule: its first (or, with `min`, its counted) match. */
export function collectEvidence(corpus: AiCorpus): AiEvidence[] {
  const evidence: AiEvidence[] = [];
  for (const rule of AI_RULES) {
    if (rule.min) {
      let count = 0;
      let first: { where: string; text: string; index: number; length: number } | null = null;
      for (const source of rule.in) {
        for (const item of texts(corpus, source)) {
          for (const match of item.text.matchAll(clone(rule.pattern, true))) {
            count++;
            first ??= { where: item.where, text: item.text, index: match.index ?? 0, length: match[0].length };
          }
        }
      }
      if (count >= rule.min && first) evidence.push({ id: rule.id, tier: rule.tier, tool: rule.tool, title: `${rule.title} (${count})`, why: rule.why, where: first.where, snippet: snippet(first.text, first.index, first.length), ratio: rule.ratio });
      continue;
    }
    const single = clone(rule.pattern, false);
    search: for (const source of rule.in) {
      for (const item of texts(corpus, source)) {
        const match = single.exec(item.text);
        if (!match) continue;
        evidence.push({ id: rule.id, tier: rule.tier, tool: rule.tool, title: rule.title, why: rule.why, where: item.where, snippet: snippet(item.text, match.index, match[0].length), ratio: rule.ratio });
        break search;
      }
    }
  }

  const probe = corpus.probe;
  const text = probe?.text || (corpus.html[0] ? visibleText(corpus.html[0]) : "");
  // Stock marketing phrases only mean something together.
  const cliches = COPY_CLICHES.map((pattern) => pattern.exec(text)?.[0]).filter((item): item is string => !!item);
  if (cliches.length >= 4) {
    evidence.push({ id: "copy-cliches", tier: "content", tool: null, title: `${cliches.length} stock AI marketing phrases`, why: "AI-written copy leans on the same phrases (“seamless”, “elevate your”, “unlock the power”). One or two mean nothing; many together are a pattern.", where: WHERE.text, snippet: cliches.slice(0, 6).map((item) => `“${item}”`).join(" · "), ratio: Math.min(2.6, 1.5 + (cliches.length - 4) * 0.2) });
  }
  if (probe) {
    const tagged = probe.attributes.filter((item) => /^data-component-(?:path|file|line|name)$/.test(item.name) && item.count >= 5);
    if (tagged.length) evidence.push({ id: "editor-tags", tier: "template", tool: null, title: "Visual-editor tags on every element", why: "Every element carries data-component-* attributes that map it back to a source file. AI builders add these so their visual editor can find the code.", where: WHERE.dom, snippet: tagged.map((item) => `${item.name} × ${item.count}`).join(", "), ratio: 5 });
    if (probe.emojiHeadings >= 3) evidence.push({ id: "emoji-headings", tier: "style", tool: null, title: "Headings that start with emoji", why: "Emoji as feature icons (“🚀 Fast”, “🔒 Secure”) are a common AI default.", where: WHERE.dom, snippet: probe.headings.filter((item) => /^\p{Extended_Pictographic}/u.test(item)).slice(0, 4).join(" · "), ratio: 1.4 });
    if (probe.gradientText >= 2) evidence.push({ id: "gradient-headlines", tier: "style", tool: null, title: "Gradient-filled headlines", why: "Gradient text in several headings is a design default AI builders use a lot. Designers use it too, so it counts for little.", where: WHERE.dom, snippet: `${probe.gradientText} headings use background-clip: text with a gradient`, ratio: 1.25 });
    const stock = probe.imageHosts.filter((item) => /(?:^|\.)(?:images\.pexels\.com|images\.unsplash\.com)$/.test(item.host));
    const stockCount = stock.reduce((sum, item) => sum + item.count, 0);
    if (stockCount >= 4) evidence.push({ id: "stock-photos", tier: "style", tool: null, title: "Stock photos hot-linked from Pexels or Unsplash", why: "AI builders are told to use Pexels and Unsplash photos by URL, so generated sites often hot-link them.", where: WHERE.dom, snippet: stock.map((item) => `${item.host} × ${item.count}`).join(", "), ratio: 1.35 });
  }

  evidence.push(...corpus.found);

  if (corpus.firstArchived && corpus.firstArchived < CHATGPT) {
    evidence.push({ id: "pre-ai", tier: "against", tool: null, title: `Online since ${corpus.firstArchived.slice(0, 4)}, before ChatGPT`, why: "The Wayback Machine first archived this address before AI app builders existed. The site could have been rebuilt since, so this lowers the score rather than ruling AI out.", where: "Wayback Machine", snippet: `First archived ${corpus.firstArchived}`, ratio: 0.35 });
  }
  const cms = corpus.stack.find((name) => CLASSIC_CMS.has(name));
  if (cms) evidence.push({ id: "classic-cms", tier: "against", tool: null, title: `Built on ${cms}`, why: `${cms} sites are assembled from themes and plugins rather than generated code, though AI may have written some of the content.`, where: "Technology stack", snippet: cms, ratio: 0.6 });
  return evidence;
}

/** Log-odds contributed by each piece of evidence after family echoes and tier caps. */
function contributions(evidence: AiEvidence[]): Map<AiEvidence, number> {
  const output = new Map<AiEvidence, number>();
  const families = new Map<string, AiEvidence[]>();
  // Agent files and repository marks for the same tool restate one fact: the project was worked on with that tool.
  const familyOf = (item: AiEvidence) => AI_RULES.find((rule) => rule.id === item.id)?.family ?? (item.tier === "file" ? `file:${item.tool}` : item.id);
  for (const item of evidence) families.set(familyOf(item), [...(families.get(familyOf(item)) ?? []), item]);
  for (const items of families.values()) {
    items.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
    items.forEach((item, index) => output.set(item, Math.log(item.ratio) * (index === 0 ? 1 : ECHO)));
  }
  for (const [tier, cap] of Object.entries(TIER_CAP) as [AiTier, number][]) {
    const inTier = evidence.filter((item) => item.tier === tier);
    const total = inTier.reduce((sum, item) => sum + (output.get(item) ?? 0), 0);
    if (total > cap) for (const item of inTier) output.set(item, (output.get(item) ?? 0) * (cap / total));
  }
  return output;
}

const TIER_RANK: AiTier[] = ["named", "file", "template", "code", "content", "style", "against"];

/** Turns evidence into the likelihood, verdict, confidence and tool ranking. */
export function scoreEvidence(evidence: AiEvidence[], coverage: AiReport["coverage"]): Pick<AiReport, "likelihood" | "verdict" | "confidence" | "tools"> {
  const weights = contributions(evidence);
  const logit = Math.log(PRIOR / (1 - PRIOR)) + [...weights.values()].reduce((sum, value) => sum + value, 0);
  const likelihood = Math.round(Math.min(98, Math.max(2, 100 / (1 + Math.exp(-logit)))));
  const verdict = likelihood >= 80 ? "very-likely" : likelihood >= 55 ? "likely" : likelihood >= 30 ? "possible" : "unlikely";

  const positive = evidence.filter((item) => item.ratio > 1);
  const has = (...tiers: AiTier[]) => positive.some((item) => tiers.includes(item.tier));
  const thin = !coverage.rendered && coverage.scripts === 0;
  const confidence = thin ? "low"
    : has("named", "file") || (has("template") && positive.length >= 3) || (likelihood <= 12 && coverage.rendered && evidence.some((item) => item.tier === "against")) ? "high"
    : has("template", "code") || (coverage.rendered && positive.length >= 3) || (likelihood < 30 && coverage.rendered && coverage.scripts > 0) ? "medium" : "low";

  // Tools: log-odds each tool's evidence adds. Generic habits are credited to the builder when one is clearly named.
  const byTool = new Map<AiToolId, { log: number; count: number; strongest: AiTier }>();
  for (const item of positive) {
    const id = item.tool ?? "assistant";
    const entry = byTool.get(id) ?? { log: 0, count: 0, strongest: item.tier };
    entry.log += Math.max(0, weights.get(item) ?? 0);
    entry.count++;
    if (TIER_RANK.indexOf(item.tier) < TIER_RANK.indexOf(entry.strongest)) entry.strongest = item.tier;
    byTool.set(id, entry);
  }
  const named = [...byTool.entries()].filter(([id, entry]) => id !== "assistant" && ["named", "file", "template"].includes(entry.strongest)).sort((a, b) => b[1].log - a[1].log)[0];
  const generic = byTool.get("assistant");
  if (named && generic) { named[1].log += generic.log; named[1].count += generic.count; byTool.delete("assistant"); }
  const total = [...byTool.values()].reduce((sum, entry) => sum + entry.log, 0) || 1;
  const tools: AiToolScore[] = [...byTool.entries()]
    .map(([id, entry]) => ({ tool: AI_TOOLS[id], share: Math.round((entry.log / total) * 100), evidence: entry.count, strongest: entry.strongest }))
    // Design defaults and stock copy alone don't point at any tool; only name one when there is real evidence.
    .filter((item) => (item.share > 0 || item.strongest === "named") && (["named", "file", "template", "code"].includes(item.strongest) || likelihood >= 55))
    .sort((a, b) => b.share - a.share)
    .slice(0, 5);
  return { likelihood, verdict, confidence, tools };
}

/** Evidence in reading order: strongest kind first, then the strongest item within it. */
export function sortEvidence(evidence: AiEvidence[]): AiEvidence[] {
  return [...evidence].sort((a, b) => TIER_RANK.indexOf(a.tier) - TIER_RANK.indexOf(b.tier) || b.ratio - a.ratio);
}

export const builderNote = (stack: string[]): string | null => {
  const builder = stack.find((name) => AI_CAPABLE_BUILDERS.has(name));
  return builder ? `${builder} has its own AI site generator. A site made with it looks the same as one arranged by hand, so we can't tell which was used here.` : null;
};
