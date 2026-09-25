/** The AI Website Detector's report: how likely a site was built with AI tools, and the evidence behind the number. */

/** AI builders and coding agents we can name. "assistant" is a general AI assistant we can't pin to one product. */
export type AiToolId =
  | "lovable" | "bolt" | "v0" | "replit" | "base44" | "emergent" | "anything" | "ai-studio" | "same" | "tempo"
  | "claude-code" | "codex" | "cursor" | "windsurf" | "copilot" | "gemini" | "assistant";

export interface AiTool {
  id: AiToolId;
  name: string;
  kind: "App builder" | "Coding agent" | "AI assistant";
  website: string | null;
  /** File in /public/ai-icons, or null for a lettered tile. */
  icon: string | null;
  /** Tile colour for tools without a mark. */
  color: string;
}

/**
 * How strong a kind of evidence is, strongest first.
 * named: the tool names itself (badge, meta tag, its CDN, its hosting)
 * file: an AI agent's instruction file, or the repo's commit history, is public
 * template: leftovers from a builder's starter project
 * code: coding habits typical of AI-written code
 * content: unfinished generated content (placeholders, stock copy)
 * style: design defaults AI tools reach for (weak on their own)
 * against: evidence of a hand-built or pre-AI site
 */
export type AiTier = "named" | "file" | "template" | "code" | "content" | "style" | "against";

export interface AiEvidence {
  id: string;
  tier: AiTier;
  tool: AiToolId | null;
  title: string;
  why: string;
  /** Where it was found: "HTML <head>", "/assets/index-abc.js", "Rendered page text", "/CLAUDE.md" … */
  where: string;
  /** The matched text with a little context. */
  snippet: string;
  /** Likelihood ratio: >1 points to AI, <1 points away from it. */
  ratio: number;
}

export interface AiToolScore { tool: AiTool; share: number; evidence: number; strongest: AiTier }

export interface AiReport {
  url: string;
  finalUrl: string;
  host: string;
  checkedAt: string;
  durationMs: number;
  /** 2–98: the chance the site was built with AI tools. Never 0 or 100: this is evidence, not proof. */
  likelihood: number;
  verdict: "very-likely" | "likely" | "possible" | "unlikely";
  confidence: "high" | "medium" | "low";
  /** Tools the evidence points to, strongest first. */
  tools: AiToolScore[];
  evidence: AiEvidence[];
  /** What we could read, so the visitor can judge how complete the check was. */
  coverage: {
    rendered: boolean;
    scripts: number;
    stylesheets: number;
    sourceMaps: number;
    textChars: number;
    agentFiles: number;
    repo: string | null;
    firstArchived: string | null;
  };
  /** The site's technology stack (from the same scan), for context. */
  stack: { name: string; category: string }[];
  screenshot: string | null;
  notes: string[];
}
