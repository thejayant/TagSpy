import { describe, expect, it } from "vitest";
import { collectEvidence, scoreEvidence, sortEvidence, type AiCorpus } from "@/lib/ai/detect";
import type { AiPageProbe } from "@/lib/ai/probe";
import { isDevInstructions, repoFor } from "@/lib/ai/sources";
import type { AiReport } from "@/lib/ai/types";

const corpus = (patch: Partial<AiCorpus> = {}): AiCorpus => ({ host: "example.com", html: [""], headers: {}, urls: [], js: [], css: [], maps: [], probe: null, found: [], firstArchived: null, stack: [], ...patch });
const coverage: AiReport["coverage"] = { rendered: true, scripts: 3, stylesheets: 1, sourceMaps: 0, textChars: 4000, agentFiles: 0, repo: null, firstArchived: null };
const probe = (patch: Partial<AiPageProbe> = {}): AiPageProbe => ({ attributes: [], badges: [], text: "", comments: [], imageHosts: [], gradientText: 0, emojiHeadings: 0, headings: [], sections: 0, repoLinks: [], ...patch });
const check = (input: AiCorpus) => { const evidence = collectEvidence(input); return { evidence, ...scoreEvidence(evidence, coverage) }; };

// Trimmed from sites published by each tool (September 2026).
const LOVABLE_HEAD = `<!-- TODO: Set the document title to the name of your application -->
<title>Lovable App</title><meta name="description" content="Lovable Generated Project"><meta name="author" content="Lovable" />
<meta property="og:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />`;
const REPLIT_HEAD = `<title>App</title><meta name="description" content="A web app built on Replit. Update this description to reflect the app." >
<link href="https://fonts.googleapis.com/css2?family=Inter&family=Architects+Daughter&family=Oxanium:wght@200..800&display=swap" rel="stylesheet">`;

describe("AI website detection", () => {
  it("names Lovable from its starter project and bundle", () => {
    const result = check(corpus({ host: "tasks.example.com", html: [LOVABLE_HEAD], js: [{ url: "https://tasks.example.com/assets/index-a.js", text: `p.useEffect(()=>{console.error("404 Error: User attempted to access non-existent route:",e.pathname)})` }] }));
    expect(result.likelihood).toBeGreaterThanOrEqual(95);
    expect(result.verdict).toBe("very-likely");
    expect(result.confidence).toBe("high");
    expect(result.tools[0].tool.id).toBe("lovable");
    expect(result.evidence.map((item) => item.id)).toEqual(expect.arrayContaining(["lovable-author", "lovable-title-todo", "lovable-404"]));
  });

  it("names Replit Agent, Bolt, v0, Base44 and Emergent from their fingerprints", () => {
    expect(check(corpus({ html: [REPLIT_HEAD] })).tools[0].tool.id).toBe("replit");
    expect(check(corpus({ headers: { "x-powered-by": "Bolt.new" }, html: [`<script async src="https://bolt.new/badge.js?s=1"></script>`] })).tools[0].tool.id).toBe("bolt");
    expect(check(corpus({ html: [`<title>v0 App</title><meta name="description" content="Created with v0"/><meta name="generator" content="v0.dev"/><img src="/placeholder.svg?height=300&amp;width=300">`] })).tools[0].tool.id).toBe("v0");
    expect(check(corpus({ html: [`<script>var TOKEN_KEY = 'base44_access_token';</script><title>Base44 APP</title>`] })).tools[0].tool.id).toBe("base44");
    expect(check(corpus({ html: [`<meta name="description" content="A product of emergent.sh"/><script src="https://assets.emergent.sh/scripts/emergent-main.js"></script>`] })).tools[0].tool.id).toBe("emergent");
  });

  it("recognises builder hosting from the address alone", () => {
    for (const [host, tool] of [["app.lovable.app", "lovable"], ["x.bolt.host", "bolt"], ["y.base44.app", "base44"], ["z.created.app", "anything"], ["v0-landing.vercel.app", "v0"]] as const) {
      const result = check(corpus({ host }));
      expect(result.tools[0]?.tool.id, host).toBe(tool);
      expect(result.likelihood, host).toBeGreaterThanOrEqual(75);
    }
  });

  it("keeps a hand-built site low even when it uses the same tools AI builders use", () => {
    // shadcn defaults, a few stock phrases and stock photos: common on hand-built sites too.
    const result = check(corpus({
      css: [{ url: "https://example.com/app.css", text: ":root{--foreground: 222.2 84% 4.9%;}" }],
      probe: probe({ text: "Build seamless dashboards. Elevate your workflow.", imageHosts: [{ host: "images.unsplash.com", count: 2 }] }),
    }));
    expect(result.likelihood).toBeLessThan(30);
    expect(result.tools).toEqual([]);
  });

  it("scores unfinished generated content and AI coding habits, capped per kind", () => {
    const text = "Call us at (555) 123-4567 or visit 123 Main Street. “Amazing!” — Sarah Johnson, CEO at TechCorp. Unlock the power of AI. Elevate your brand. Seamless setup. Cutting-edge tools. Harness the power of data.";
    const html = `<!-- Hero Section --><section></section><!-- Features Section --><section></section><!-- Testimonials Section --><!-- Contact Section --><!-- Footer -->`;
    const js = [{ url: "https://example.com/script.js", text: `// Smooth scrolling for anchor links\ndocument.querySelectorAll('a');\n// Mobile menu toggle\nalert('Thank you for your message! We will get back to you soon.');` }];
    const result = check(corpus({ html: [html], js, probe: probe({ text }) }));
    expect(result.evidence.map((item) => item.id)).toEqual(expect.arrayContaining(["placeholder-phone", "placeholder-address", "copy-cliches", "llm-section-comments", "llm-vanilla-js"]));
    expect(result.likelihood).toBeGreaterThanOrEqual(80);
    // No tool is named: these habits belong to AI assistants in general.
    expect(result.tools[0].tool.id).toBe("assistant");
  });

  it("does not count library warnings with emoji, only habits in bulk", () => {
    const js = [{ url: "https://example.com/vendor.js", text: `console.warn("⚠️ Node.js 18 and below are deprecated")` }];
    expect(check(corpus({ js })).evidence.map((item) => item.id)).not.toContain("llm-emoji-log");
  });

  it("lowers the score for sites online before ChatGPT and classic CMSs", () => {
    const base = check(corpus({ probe: probe() }));
    const old = check(corpus({ probe: probe(), firstArchived: "2014-05-12", stack: ["WordPress"] }));
    expect(old.likelihood).toBeLessThan(base.likelihood);
    expect(old.evidence.filter((item) => item.tier === "against")).toHaveLength(2);
    // A pre-AI domain rebuilt with Lovable is still flagged.
    expect(check(corpus({ html: [LOVABLE_HEAD], firstArchived: "2012-01-01" })).likelihood).toBeGreaterThanOrEqual(90);
  });

  it("orders evidence strongest first", () => {
    const evidence = sortEvidence(collectEvidence(corpus({ html: [LOVABLE_HEAD], firstArchived: "2014-01-01", css: [{ url: "", text: "--foreground: 222.2 84% 4.9%" }] })));
    expect(evidence[0].tier).toBe("named");
    expect(evidence.at(-1)?.tier).toBe("against");
  });

  it("never claims certainty", () => {
    const evidence = collectEvidence(corpus({ host: "a.lovable.app", html: [LOVABLE_HEAD + `<div id="lovable-badge"></div>`] }));
    expect(scoreEvidence(evidence, coverage).likelihood).toBe(98);
    expect(scoreEvidence([], coverage).likelihood).toBeGreaterThanOrEqual(2);
  });
});

describe("AI check sources", () => {
  it("tells coding-agent instructions from shopping-agent guides", () => {
    expect(isDevInstructions("/AGENTS.md", "# Agent Instructions — Allbirds\nThis document describes how AI agents can interact with Allbirds's online store: browse products, check stock and place orders.")).toBe(false);
    expect(isDevInstructions("/AGENTS.md", "## Setup\nRun `pnpm install` then `pnpm dev`. Run tests with `pnpm test` before every commit. Components live in src/components.")).toBe(true);
    expect(isDevInstructions("/.replit", "run = \"npm run dev\"\nmodules = [\"nodejs-20\"]")).toBe(true);
  });

  it("finds a site's own repository, not the libraries it links to", () => {
    expect(repoFor("jane.github.io", "/portfolio/", [])).toBe("jane/portfolio");
    expect(repoFor("jane.github.io", "/", [])).toBe("jane/jane.github.io");
    expect(repoFor("tagspy.vercel.app", "/", ["thejayant/TagSpy", "vercel/next.js"])).toBe("thejayant/TagSpy");
    expect(repoFor("example.com", "/", ["vercel/next.js", "facebook/react"])).toBeNull();
  });
});

describe("AI check quota", () => {
  it("allows one lifetime run and gives it back when no result was delivered", async () => {
    const db = await import("@/lib/db");
    const key = `ai:user:test-${Date.now()}`;
    expect(await db.consumeLifetime(key, 1)).toBe(true);
    expect(await db.consumeLifetime(key, 1)).toBe(false);
    expect(await db.lifetimeUsed(key)).toBe(1);
    await db.refundLifetime(key);
    expect(await db.lifetimeUsed(key)).toBe(0);
    expect(await db.consumeLifetime(key, 1)).toBe(true);
  });
});
