import type { AiTier, AiToolId } from "./types";

/** Copy shared by the AI Website Detector page and its structured data (FAQ rich results). */

export const DETECTS: { id: AiToolId; line: string }[] = [
  { id: "lovable", line: "Badge, author tags, Lovable Cloud code and its 404 page" },
  { id: "bolt", line: "Bolt badge, Bolt.new hosting headers and share image" },
  { id: "v0", line: "Generator tag, “v0 App” title and placeholder images" },
  { id: "replit", line: "Agent template, dev banner and Replit's build plugins" },
  { id: "base44", line: "Base44 storage, SDK and default title" },
  { id: "emergent", line: "“Made with Emergent” badge and script" },
  { id: "anything", line: "Code served from the Anything (Create) CDN" },
  { id: "ai-studio", line: "The aistudiocdn.com import map" },
  { id: "claude-code", line: "Public CLAUDE.md, commit signatures in the repo" },
  { id: "codex", line: "Public AGENTS.md, Codex commits and branches" },
  { id: "cursor", line: ".cursorrules and Cursor agent commits" },
  { id: "copilot", line: "Copilot instructions and coding-agent commits" },
];

export const TIER_INFO: Record<AiTier, { label: string; icon: string; blurb: string }> = {
  named: { label: "Named traces", icon: "verified", blurb: "The tool names itself: a badge, a meta tag, its CDN or its hosting." },
  file: { label: "Agent files & repo history", icon: "description", blurb: "An AI agent's instruction file or the repository's commits are public." },
  template: { label: "Template leftovers", icon: "content_copy", blurb: "Pieces of a builder's starter project nobody removed." },
  code: { label: "AI coding habits", icon: "code_blocks", blurb: "Comments and patterns AI assistants write into every project." },
  content: { label: "Unfinished generated content", icon: "edit_note", blurb: "Placeholder details and stock copy generated with the page." },
  style: { label: "AI design defaults", icon: "palette", blurb: "Design choices AI tools reach for. Weak on their own." },
  against: { label: "Points to a hand-built site", icon: "handyman", blurb: "Evidence that lowers the score." },
};

export const HOW_IT_WORKS = [
  { icon: "code", title: "Reads the code", text: "The HTML, every JavaScript bundle, the CSS and any public source maps, the way Site DNA does." },
  { icon: "travel_explore", title: "Runs the page", text: "A real browser loads and scrolls the site to see what only exists at runtime: editor tags, badges, the final text." },
  { icon: "fingerprint", title: "Matches fingerprints", text: "Dozens of traces checked against sites built with each tool, plus agent files, repo commits and the Wayback Machine." },
  { icon: "balance", title: "Weighs the evidence", text: "Each clue has a strength. Strong ones decide, weak ones only nudge, and evidence against AI pulls the score down." },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Can you tell if a website was made with AI?",
    a: "Often, yes. AI app builders like Lovable, Bolt, v0 and Replit leave traces in the sites they publish: badges, meta tags, starter-project leftovers, their own CDNs and hosting. The AI Website Detector reads a site's public code, renders it in a real browser, and reports how likely it is that AI built it, with every piece of evidence it found.",
  },
  {
    q: "Which AI website builders and coding agents can it detect?",
    a: "Lovable, Bolt, v0 by Vercel, Replit Agent, Base44, Emergent, Anything, Google AI Studio, Same and Tempo from their fingerprints, and Claude Code, OpenAI Codex, Cursor, Windsurf, GitHub Copilot and Gemini CLI when their instruction files or commits are public. It also spots habits typical of AI-written code from any assistant.",
  },
  {
    q: "How accurate is the AI website checker?",
    a: "When a builder names itself (a badge, a generator tag, its hosting), the result is close to certain. Weaker clues like design defaults or stock phrases only nudge the score, and evidence of a hand-built or pre-2022 site pulls it down. It is a likelihood, not proof: every clue is shown so you can judge it yourself.",
  },
  {
    q: "Why can't it always detect Claude Code, Codex or Cursor?",
    a: "Coding agents write ordinary files and leave no signature in a finished website. They can only be identified when their instruction files (CLAUDE.md, AGENTS.md, .cursorrules) are published with the site, or the site's GitHub repository shows their commits. A low score never proves a site was written by hand.",
  },
  {
    q: "Is it free?",
    a: "Every person gets one free check. Each check runs a real browser in the cloud, which costs money, so the limit keeps the tool free for everyone. Supporting the project helps raise it.",
  },
  {
    q: "Do you store the websites I check?",
    a: "No. The report exists only in the response to you and in your browser tab. Nothing about the site you checked is saved on our servers.",
  },
];
