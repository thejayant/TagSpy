import type { AiTier, AiTool, AiToolId } from "./types";

/**
 * Fingerprints AI builders and coding agents leave in a published website. Each rule has a likelihood ratio: how many
 * times more often the pattern appears on AI-built sites than on hand-built ones. The named and template rules were
 * checked against live sites built with each tool (Lovable, Bolt, v0, Replit, Base44, Emergent, Anything).
 * Patterns use strings that survive minification.
 */

export const AI_TOOLS: Record<AiToolId, AiTool> = {
  lovable: { id: "lovable", name: "Lovable", kind: "App builder", website: "https://lovable.dev", icon: "lovable.svg", color: "#ff4d8d" },
  bolt: { id: "bolt", name: "Bolt", kind: "App builder", website: "https://bolt.new", icon: "bolt.svg", color: "#1389fd" },
  v0: { id: "v0", name: "v0 by Vercel", kind: "App builder", website: "https://v0.app", icon: "v0.svg", color: "#111111" },
  replit: { id: "replit", name: "Replit Agent", kind: "App builder", website: "https://replit.com", icon: "replit.svg", color: "#f26207" },
  base44: { id: "base44", name: "Base44", kind: "App builder", website: "https://base44.com", icon: null, color: "#ff6a00" },
  emergent: { id: "emergent", name: "Emergent", kind: "App builder", website: "https://emergent.sh", icon: null, color: "#16a34a" },
  anything: { id: "anything", name: "Anything", kind: "App builder", website: "https://createanything.com", icon: null, color: "#7c3aed" },
  "ai-studio": { id: "ai-studio", name: "Google AI Studio", kind: "App builder", website: "https://aistudio.google.com", icon: "ai-studio.svg", color: "#4285f4" },
  same: { id: "same", name: "Same", kind: "App builder", website: "https://same.new", icon: null, color: "#0ea5e9" },
  tempo: { id: "tempo", name: "Tempo", kind: "App builder", website: "https://tempo.new", icon: null, color: "#6366f1" },
  "claude-code": { id: "claude-code", name: "Claude Code", kind: "Coding agent", website: "https://claude.com/claude-code", icon: "claude.svg", color: "#d97757" },
  codex: { id: "codex", name: "OpenAI Codex", kind: "Coding agent", website: "https://openai.com/codex", icon: "openai.svg", color: "#10a37f" },
  cursor: { id: "cursor", name: "Cursor", kind: "Coding agent", website: "https://cursor.com", icon: "cursor.svg", color: "#111111" },
  windsurf: { id: "windsurf", name: "Windsurf", kind: "Coding agent", website: "https://windsurf.com", icon: "windsurf.svg", color: "#0b9e8f" },
  copilot: { id: "copilot", name: "GitHub Copilot", kind: "Coding agent", website: "https://github.com/features/copilot", icon: "copilot.svg", color: "#6e40c9" },
  gemini: { id: "gemini", name: "Gemini CLI", kind: "Coding agent", website: "https://github.com/google-gemini/gemini-cli", icon: "gemini.svg", color: "#1a73e8" },
  assistant: { id: "assistant", name: "An AI assistant", kind: "AI assistant", website: null, icon: null, color: "#6d6bff" },
};

/** Where a rule looks. */
export type AiSource = "html" | "headers" | "host" | "urls" | "js" | "css" | "maps" | "text" | "dom";

export interface AiRule {
  id: string;
  tool: AiToolId | null;
  tier: AiTier;
  in: AiSource[];
  pattern: RegExp;
  title: string;
  why: string;
  ratio: number;
  /** Rules in one family describe the same underlying fact, so only the strongest counts in full. */
  family?: string;
  /** Minimum number of matches before the rule counts (for habits that only mean something in bulk). */
  min?: number;
}

const R = (id: string, tool: AiToolId | null, tier: AiTier, sources: AiSource[], pattern: RegExp, ratio: number, title: string, why: string, extra: Partial<Pick<AiRule, "family" | "min">> = {}): AiRule =>
  ({ id, tool, tier, in: sources, pattern, ratio, title, why, ...extra });

export const AI_RULES: AiRule[] = [
  // ── Lovable ──────────────────────────────────────────────────────────────────────────────────────────────────────
  R("lovable-badge", "lovable", "named", ["html", "dom"], /id=["']?lovable-badge|#lovable-badge\b/, 60, "“Edit with Lovable” badge", "Lovable adds this badge to every app it publishes on its free plan.", { family: "lovable" }),
  R("lovable-author", "lovable", "named", ["html"], /<meta[^>]+name=["']author["'][^>]+content=["']Lovable["']/i, 50, "Page author is “Lovable”", "Lovable's starter project sets the page author to Lovable; it stays until someone edits it.", { family: "lovable" }),
  R("lovable-description", "lovable", "named", ["html"], /Lovable Generated Project/, 50, "“Lovable Generated Project” description", "The default description Lovable writes into every new project.", { family: "lovable" }),
  R("lovable-og", "lovable", "named", ["html"], /lovable\.dev\/opengraph-image|twitter:site["'][^>]+@lovable(?:_dev)?["']/i, 40, "Lovable's share image or X account", "The share preview still points at Lovable's own image or @Lovable account.", { family: "lovable" }),
  R("lovable-sdk", "lovable", "named", ["js", "maps"], /@lovable\.dev\/[\w-]+|__lovable_[a-z_]+|lovable-tagger|oauth\.lovable\.app/, 45, "Lovable's own code in the bundle", "The JavaScript includes packages published by Lovable (Lovable Cloud auth, the component tagger).", { family: "lovable" }),
  R("lovable-cdn", "lovable", "named", ["html", "urls", "css"], /cdn\.gpteng\.co|gptengineer\.js/, 40, "Loads files from Lovable's CDN", "gpteng.co is Lovable's CDN (the company was called GPT Engineer).", { family: "lovable" }),
  R("lovable-host", "lovable", "named", ["host"], /\.lovable(?:project)?\.(?:app|com)$/, 60, "Hosted on Lovable", "Only apps built in Lovable are published on lovable.app.", { family: "lovable" }),
  R("lovable-tagger-attr", "lovable", "named", ["dom"], /data-lov-(?:id|name)/, 40, "Lovable component tags in the page", "Lovable's editor tags every element with data-lov-* attributes to map it back to the code.", { family: "lovable" }),
  R("lovable-title-todo", "lovable", "template", ["html"], /TODO: Set the document title to the name of your application/, 30, "Lovable's “set the document title” TODO", "A comment from Lovable's starter index.html that was never removed.", { family: "lovable-template" }),
  R("lovable-title", "lovable", "template", ["html"], /<title>\s*Lovable App\s*<\/title>/i, 20, "Default page title “Lovable App”", "The page title Lovable gives every new project.", { family: "lovable-template" }),
  R("lovable-404", "lovable", "template", ["js", "maps"], /404 Error: User attempted to access non-existent route/, 12, "Lovable's 404 page", "The not-found page from Lovable's starter project logs exactly this message.", { family: "lovable-template" }),

  // ── Bolt ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  R("bolt-badge", "bolt", "named", ["html", "urls", "dom"], /bolt\.new\/badge\.js/, 60, "“Made in Bolt” badge", "Bolt injects this badge script into apps it publishes.", { family: "bolt" }),
  R("bolt-header", "bolt", "named", ["headers"], /x-powered-by: Bolt\.new/i, 60, "Server says “Powered by Bolt.new”", "Bolt's hosting sends an X-Powered-By: Bolt.new header.", { family: "bolt" }),
  R("bolt-og", "bolt", "named", ["html"], /bolt\.new\/static\/og_default/, 50, "Bolt's default share image", "The share preview is Bolt's placeholder image.", { family: "bolt" }),
  R("bolt-host", "bolt", "named", ["host"], /\.bolt\.(?:host|new)$/, 55, "Hosted on Bolt", "bolt.host serves apps published from Bolt.", { family: "bolt" }),
  R("bolt-starter", "bolt", "template", ["js", "maps"], /Start prompting \(or editing\) to see magic happen/, 25, "Bolt's starter screen text", "The placeholder text in Bolt's starter project.", { family: "bolt-template" }),

  // ── v0 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  R("v0-generator", "v0", "named", ["html"], /<meta[^>]+name=["']generator["'][^>]+content=["']v0\.(?:dev|app)["']/i, 60, "Generator tag says v0", "v0 sets <meta name=\"generator\"> to v0.app (earlier v0.dev).", { family: "v0" }),
  R("v0-description", "v0", "named", ["html"], /content=["']Created with v0["']/i, 50, "“Created with v0” description", "The default description in every v0 project.", { family: "v0" }),
  R("v0-host", "v0", "named", ["host"], /^v0-[\w-]+\.vercel\.app$/, 25, "Deployed from v0", "v0 names its deployments v0-<project>.vercel.app.", { family: "v0" }),
  R("v0-assets", "v0", "named", ["urls", "html"], /vusercontent\.net/, 40, "Assets on v0's content host", "vusercontent.net serves files uploaded in v0.", { family: "v0" }),
  R("v0-title", "v0", "template", ["html"], /<title>\s*v0 App\s*<\/title>/i, 20, "Default page title “v0 App”", "The page title v0 gives every generated app.", { family: "v0-template" }),
  R("v0-placeholder", "v0", "template", ["html", "js", "urls"], /\/placeholder\.svg\?(?:height|width)=\d+/, 10, "v0 placeholder images", "v0 fills image slots with /placeholder.svg?height=…&width=… until real images are added.", { family: "v0-template" }),
  R("v0-placeholder-files", "v0", "template", ["html", "js", "urls"], /\/placeholder-(?:logo|user)\.(?:png|svg|jpg)/, 5, "v0 placeholder files", "v0's starter ships placeholder-logo and placeholder-user images.", { family: "v0-template" }),

  // ── Replit ───────────────────────────────────────────────────────────────────────────────────────────────────────
  R("replit-description", "replit", "named", ["html"], /A web app built on Replit\. Update this description/, 45, "“A web app built on Replit” description", "The default description in Replit Agent's web app template.", { family: "replit" }),
  R("replit-banner", "replit", "named", ["html", "urls"], /replit\.com\/public\/js\/replit-dev-banner\.js/, 35, "Replit's dev banner script", "Replit Agent projects include this banner script, and it often ships to production.", { family: "replit" }),
  R("replit-metadata", "replit", "named", ["dom", "js"], /data-replit-metadata/, 40, "Replit component tags in the page", "Replit's Vite plugin tags elements with data-replit-metadata for its visual editor.", { family: "replit" }),
  R("replit-plugins", "replit", "named", ["maps", "js"], /@replit\/vite-plugin-[\w-]+/, 30, "Replit's build plugins", "The build used Replit's own Vite plugins (cartographer, runtime error modal, theme).", { family: "replit" }),
  R("replit-fonts", "replit", "template", ["html"], /Architects\+Daughter[^"']*Oxanium|Oxanium[^"']*Architects\+Daughter/, 15, "Replit template's 40-font Google Fonts link", "Replit Agent's template loads a fixed set of about 40 Google Fonts for its theme picker.", { family: "replit-template" }),
  R("replit-404", "replit", "template", ["js", "maps"], /Did you forget to add the page to the router\?/, 12, "Replit Agent's 404 page", "The not-found page from Replit Agent's template says exactly this.", { family: "replit-template" }),
  R("replit-host", "replit", "code", ["host", "urls"], /(?:^|\.)replit\.(?:app|dev)$|i\.replit\.com\/script\.js|\.repl\.co$/, 3, "Hosted on Replit", "Replit hosts both hand-written and Agent-built apps; most new apps there are built with Replit Agent.", { family: "replit-host" }),

  // ── Other builders ───────────────────────────────────────────────────────────────────────────────────────────────
  R("base44-assets", "base44", "named", ["html", "urls", "js"], /base44-prod|media\.base44\.com|base44_access_token|@base44\/sdk/, 50, "Base44's storage and SDK", "Images and sign-in come from Base44's own storage and SDK.", { family: "base44" }),
  R("base44-host", "base44", "named", ["host"], /\.base44\.app$/, 55, "Hosted on Base44", "base44.app only serves apps built in Base44.", { family: "base44" }),
  R("base44-title", "base44", "template", ["html"], /<title>\s*Base44 APP\s*<\/title>/i, 25, "Default page title “Base44 APP”", "The page title Base44 gives new apps.", { family: "base44-template" }),
  R("emergent-script", "emergent", "named", ["html", "urls"], /assets\.emergent\.sh\/scripts|id=["']emergent-badge|Made with Emergent/, 60, "Emergent's badge and script", "Emergent adds its script and a “Made with Emergent” badge to published apps.", { family: "emergent" }),
  R("emergent-description", "emergent", "named", ["html"], /A product of emergent\.sh|<title>\s*Emergent \| Fullstack App/i, 50, "Emergent's default title and description", "Emergent's starter sets these until someone edits them.", { family: "emergent" }),
  R("emergent-host", "emergent", "named", ["host"], /\.emergent(?:agent)?\.(?:host|com)$/, 55, "Hosted on Emergent", "emergent.host serves apps published from Emergent.", { family: "emergent" }),
  R("anything-cdn", "anything", "named", ["html", "urls"], /cdn\.created\.app|createanything\.com/, 50, "Built on Anything", "The app's code is served from created.app, the CDN of the Anything AI builder.", { family: "anything" }),
  R("anything-host", "anything", "named", ["host"], /\.created\.app$/, 55, "Hosted on Anything", "created.app serves apps built with Anything (formerly Create).", { family: "anything" }),
  R("ai-studio-importmap", "ai-studio", "named", ["html", "urls"], /aistudiocdn\.com/, 50, "Google AI Studio import map", "Apps built in Google AI Studio load React and their libraries from aistudiocdn.com.", { family: "ai-studio" }),
  R("same-assets", "same", "named", ["html", "urls", "css"], /same-assets\.com/, 40, "Assets on Same's CDN", "same-assets.com hosts images for sites cloned with Same.", { family: "same" }),
  R("tempo-devtools", "tempo", "named", ["js", "maps", "html"], /tempo-devtools|TempoDevtools/, 30, "Tempo's editor tools", "Tempo Labs projects include its devtools package.", { family: "tempo" }),

  // ── Coding agents: what they write into a site ───────────────────────────────────────────────────────────────────
  R("claude-trailer", "claude-code", "named", ["html", "js", "maps", "text"], /Generated with \[?Claude Code\]?|Co-Authored-By: Claude/i, 40, "Claude Code's signature", "Claude Code signs its commits and pull requests with this line; here it ended up in the site itself.", { family: "claude" }),

  // ── Code habits typical of AI assistants (tool unknown) ──────────────────────────────────────────────────────────
  R("llm-vanilla-js", null, "code", ["js", "html", "maps"], /\/\/ ?(?:Smooth scroll(?:ing)? for (?:anchor|navigation|nav) links|Mobile menu toggle|Navbar scroll effect|Add scroll effect to (?:navbar|header)|Intersection Observer for (?:fade-in |scroll )?animations|Form submission handl(?:er|ing)|Animate elements on scroll)/i, 4, "Stock AI comments in the site's JavaScript", "Comments like “// Smooth scrolling for anchor links” and “// Mobile menu toggle” are what AI assistants write into every landing page.", { family: "llm-js" }),
  R("llm-alert", null, "code", ["js", "html", "maps"], /alert\(\s*['"`]Thank you for (?:your message|contacting|subscribing|reaching out)/i, 3, "“Thank you for your message!” alert", "A contact form that only shows an alert is the stub AI assistants write when there's no backend.", { family: "llm-js" }),
  R("llm-real-app", null, "code", ["js", "maps", "html"], /In a real (?:app|application|implementation|project)|In production,? (?:you would|this would)|Simulate (?:an? )?API (?:call|request)|\/\/ Mock data|Replace (?:this )?with (?:your|actual|real) /i, 3.5, "“In a real app…” notes left in the code", "AI assistants explain their shortcuts in comments like “In a real application you would…” and “Simulate API call”.", { family: "llm-notes" }),
  R("llm-emoji-log", null, "code", ["js", "maps"], /console\.(?:log|error|warn|info)\(\s*[`'"](?:✅|❌|🚀|🔥|✨|📊|🎉|⚠️|🔍|📝|💾|🔄)/gu, 2, "Emoji in console messages", "Logging with emoji (“✅ Saved”, “🚀 Started”) is a strong habit of AI-written code. Libraries do it now and then, so it only counts in bulk.", { family: "llm-notes", min: 4 }),
  R("llm-section-comments", null, "code", ["html", "dom"], /<!--\s*(?:Hero|About|Services|Features|Testimonials?|Contact|Footer|Header|Navigation|Pricing|FAQ|CTA|Portfolio|Gallery|Team|Stats|Newsletter)(?: Section)?\s*-->/gi, 3, "Section-by-section HTML comments", "AI assistants label every block (<!-- Hero Section -->, <!-- Features Section -->, <!-- Footer -->) when they write a page by hand.", { family: "llm-html", min: 4 }),
  R("llm-css-banners", null, "code", ["css"], /\/\*\s*=+\s*[A-Z][\w &]+\s*=+\s*\*\//g, 1.8, "Banner comments in the CSS", "Big /* ===== Section ===== */ dividers are a common trait of AI-written stylesheets.", { family: "llm-css", min: 4 }),

  // ── Unfinished generated content ─────────────────────────────────────────────────────────────────────────────────
  R("placeholder-phone", null, "content", ["text"], /\(?\+?1?\s?\(?555\)?[\s.-]\d{3}[\s.-]?\d{4}/, 2.2, "A 555 phone number", "555 numbers are fictional; AI builders fill contact sections with them.", { family: "placeholder" }),
  R("placeholder-address", null, "content", ["text"], /\b123 (?:Main|Business|Tech|Innovation|Market|Street|Design|Creative) (?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Lane|Road|Drive)/i, 2.2, "A placeholder street address", "“123 Main Street” style addresses are placeholders generated with the page.", { family: "placeholder" }),
  R("placeholder-email", null, "content", ["text"], /\b(?:hello|info|contact|support|hi)@(?:example|yourcompany|company|yourdomain|yourbrand)\.com\b/i, 2, "A placeholder email address", "Contact details on example.com or yourcompany.com were never filled in.", { family: "placeholder" }),
  R("placeholder-people", null, "content", ["text"], /\b(?:Sarah Johnson|John Doe|Jane Smith|Michael Chen|Emily (?:Rodriguez|Davis)|David (?:Kim|Park))\b/, 1.8, "Stock testimonial names", "Names like Sarah Johnson and Michael Chen are the default people AI models invent for testimonials and team sections.", { family: "placeholder" }),
  R("placeholder-company", null, "content", ["text"], /\b(?:TechCorp|Acme (?:Corp|Inc)|YourCompany|Your Company|Company Name|StartupXYZ|InnovateCo)\b/, 1.8, "Placeholder company names", "“TechCorp” and “Your Company” are stand-ins generated with the copy.", { family: "placeholder" }),
  R("placeholder-lorem", null, "content", ["text"], /\bLorem ipsum dolor sit amet\b/i, 1.3, "Lorem ipsum text", "Filler text left on the page. Also common in hand-made templates, so it counts for little.", { family: "placeholder" }),
  R("vite-default", null, "content", ["html"], /<title>\s*Vite \+ (?:React|Vue|TS|React \+ TS)\s*<\/title>|href=["']\/vite\.svg["']/i, 1.6, "Vite starter leftovers", "The Vite starter's title or favicon is still in place, which is common in generated projects nobody polished.", { family: "starter" }),

  // ── Design defaults AI tools reach for ───────────────────────────────────────────────────────────────────────────
  R("llm-gradient", null, "style", ["css", "html", "js"], /#667eea[^;{}]{0,40}#764ba2/i, 2.5, "The #667eea → #764ba2 gradient", "This purple gradient is the one AI assistants use by default so often it has become a tell.", { family: "gradient" }),
  R("tailwind-play-cdn", null, "style", ["html", "urls"], /cdn\.tailwindcss\.com/, 1.6, "Tailwind loaded from its play CDN", "The Tailwind play CDN is meant for prototypes; AI assistants use it for single-file sites.", { family: "cdn" }),
  R("shadcn-defaults", null, "style", ["css"], /--foreground:\s*222\.2 84% 4\.9%/, 1.4, "Unchanged shadcn/ui default colours", "The theme still uses shadcn/ui's default colour values, as generated projects often do. Many hand-built sites use them too.", { family: "shadcn" }),
  R("shadcn-sidebar-vars", null, "style", ["css"], /--sidebar-background:\s*0 0% 98%/, 1.4, "shadcn/ui sidebar variables left in", "The sidebar colour variables from the builder templates are there even though the site may not have a sidebar.", { family: "shadcn" }),
];

/** Instruction files AI coding agents read from a project; a public copy means the site's repo was set up for that agent. */
export const AGENT_FILES: { path: string; tool: AiToolId; title: string }[] = [
  { path: "/CLAUDE.md", tool: "claude-code", title: "CLAUDE.md (Claude Code's project instructions)" },
  { path: "/.claude/settings.json", tool: "claude-code", title: "Claude Code settings folder" },
  { path: "/AGENTS.md", tool: "codex", title: "AGENTS.md (OpenAI Codex's project instructions)" },
  { path: "/GEMINI.md", tool: "gemini", title: "GEMINI.md (Gemini CLI's project instructions)" },
  { path: "/.cursorrules", tool: "cursor", title: ".cursorrules (Cursor's project rules)" },
  { path: "/.windsurfrules", tool: "windsurf", title: ".windsurfrules (Windsurf's project rules)" },
  { path: "/.github/copilot-instructions.md", tool: "copilot", title: "Copilot instructions file" },
  { path: "/replit.md", tool: "replit", title: "replit.md (Replit Agent's project notes)" },
  { path: "/.replit", tool: "replit", title: ".replit (Replit project config)" },
  { path: "/.bolt/prompt", tool: "bolt", title: ".bolt/prompt (Bolt's system prompt)" },
];

/** Commit authors and trailers that name the AI tool that made the commit. */
export const COMMIT_MARKS: { pattern: RegExp; tool: AiToolId; title: string }[] = [
  { pattern: /lovable-dev\[bot\]|gpt-engineer-app\[bot\]/i, tool: "lovable", title: "Commits by Lovable's bot" },
  { pattern: /\bv0\[bot\]|v0-vercel/i, tool: "v0", title: "Commits by v0's bot" },
  { pattern: /bolt-new|stackblitz\[bot\]/i, tool: "bolt", title: "Commits by Bolt" },
  { pattern: /Replit-Commit-Author:\s*Agent|replit-agent/i, tool: "replit", title: "Commits by Replit Agent" },
  { pattern: /Generated with \[?Claude Code|Co-Authored-By: Claude|claude\[bot\]/i, tool: "claude-code", title: "Commits signed by Claude Code" },
  { pattern: /chatgpt-codex-connector|codex\[bot\]|^codex\//im, tool: "codex", title: "Commits or branches from OpenAI Codex" },
  { pattern: /cursor\[bot\]|cursoragent|Co-authored-by: Cursor/i, tool: "cursor", title: "Commits by Cursor's agent" },
  { pattern: /copilot-swe-agent|Copilot\[bot\]/i, tool: "copilot", title: "Commits by GitHub Copilot's coding agent" },
  { pattern: /google-labs-jules|jules\[bot\]/i, tool: "gemini", title: "Commits by Google's Jules" },
];

/** Stock phrases from AI-written marketing copy. A handful on one page means little alone, so they are counted together. */
export const COPY_CLICHES = [
  /\bunlock (?:the|your) (?:full )?(?:power|potential)\b/i, /\belevate your\b/i, /\btransform (?:the way|your)\b/i, /\bseamless(?:ly)?\b/i,
  /\bempower(?:s|ing)? (?:you|your|teams|businesses)\b/i, /\brevolutioni[sz]e\b/i, /\bcutting-edge\b/i, /\bharness the power\b/i,
  /\bin today'?s (?:fast-paced|digital|competitive)\b/i, /\bnext-generation\b/i, /\bstate-of-the-art\b/i, /\bgame[- ]changer\b/i,
  /\bunleash\b/i, /\bsupercharge\b/i, /\bdive (?:deep|into)\b/i, /\bat your fingertips\b/i, /\bwhether you'?re a\b/i, /\bnot just\b[^.]{0,40}\bit'?s\b/i,
  /\bstreamline(?:d)? your\b/i, /\beffortless(?:ly)?\b/i, /\bbuilt for the future\b/i, /\bjoin (?:thousands|millions) of\b/i,
];
