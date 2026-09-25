/**
 * Runs in the rendered page during the AI check (after scrolling, so lazy sections exist). A plain JavaScript string,
 * like the deep-scan probes, so no transpiler helper leaks into the page. It only reads the DOM.
 */
export interface AiPageProbe {
  /** Unusual data-* attribute names (data-lov-id, data-replit-metadata …) with how many elements carry them. */
  attributes: { name: string; count: number }[];
  /** Links and badges that point at AI builders. */
  badges: string[];
  /** The page's visible text. */
  text: string;
  /** HTML comments left in the DOM. */
  comments: string[];
  /** Hosts images load from. */
  imageHosts: { host: string; count: number }[];
  /** Headings whose text uses a gradient fill. */
  gradientText: number;
  /** h1–h3 texts that start with an emoji. */
  emojiHeadings: number;
  headings: string[];
  sections: number;
  /** github.com repository links on the page. */
  repoLinks: string[];
}

export const AI_PROBE = String.raw`(() => {
  const out = { attributes: [], badges: [], text: "", comments: [], imageHosts: [], gradientText: 0, emojiHeadings: 0, headings: [], sections: 0, repoLinks: [] };
  try {
    const counts = new Map();
    const nodes = Array.from(document.querySelectorAll("*")).slice(0, 6000);
    for (const el of nodes) {
      for (const name of el.getAttributeNames()) {
        if (/^data-(lov|component|replit|v0|tempo|bolt|base44|emergent|same|anything|source|loc)/.test(name)) counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
    out.attributes = Array.from(counts, ([name, count]) => ({ name, count })).slice(0, 20);

    const badgeSelector = "#lovable-badge, #emergent-badge, [id*='bolt-badge'], a[href*='lovable.dev'], a[href*='bolt.new'], a[href*='v0.app'], a[href*='v0.dev'], a[href*='replit.com'], a[href*='emergent.sh'], a[href*='base44.com'], a[href*='createanything.com'], a[href*='same.new']";
    for (const el of Array.from(document.querySelectorAll(badgeSelector)).slice(0, 10)) {
      const href = el.getAttribute("href") || "";
      const label = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
      out.badges.push((el.id ? "#" + el.id + " " : "") + (href ? href.slice(0, 120) + " " : "") + (label ? "“" + label + "”" : ""));
    }

    out.text = (document.body ? document.body.innerText : "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").slice(0, 60000);

    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode() && out.comments.length < 200) {
      const value = (walker.currentNode.nodeValue || "").trim();
      if (value && value.length < 160 && !/^\$|^\/?\$|^\[if |^<!\[/.test(value)) out.comments.push("<!-- " + value + " -->");
    }

    const hosts = new Map();
    for (const img of Array.from(document.images).slice(0, 400)) {
      try { const host = new URL(img.currentSrc || img.src, location.href).hostname; hosts.set(host, (hosts.get(host) || 0) + 1); } catch (e) {}
    }
    out.imageHosts = Array.from(hosts, ([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count).slice(0, 15);

    const heads = Array.from(document.querySelectorAll("h1, h2, h3")).slice(0, 80);
    for (const el of heads) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (out.headings.length < 40) out.headings.push(text.slice(0, 120));
      if (/^\p{Extended_Pictographic}/u.test(text)) out.emojiHeadings++;
      const candidates = [el].concat(Array.from(el.querySelectorAll("span")).slice(0, 6));
      if (candidates.some((node) => { const cs = getComputedStyle(node); return (cs.backgroundClip === "text" || cs.webkitBackgroundClip === "text") && /gradient/.test(cs.backgroundImage); })) out.gradientText++;
    }
    out.sections = document.querySelectorAll("section").length;

    const repos = new Set();
    for (const a of Array.from(document.querySelectorAll("a[href*='github.com/']")).slice(0, 60)) {
      const match = /github\.com\/([\w.-]+)\/([\w.-]+)/.exec(a.getAttribute("href") || "");
      if (match && !/^(sponsors|features|topics|orgs|marketplace|about|pricing|login|settings)$/.test(match[1])) repos.add(match[1] + "/" + match[2].replace(/\.git$/, ""));
    }
    out.repoLinks = Array.from(repos).slice(0, 10);
  } catch (e) {}
  return out;
})()`;
