import { envString } from "../env";
import { safeFetch } from "../url-safety";
import { AGENT_FILES, AI_TOOLS, COMMIT_MARKS } from "./signatures";
import type { AiEvidence } from "./types";

/**
 * The AI check's lookups beyond the page itself: agent instruction files the site serves publicly, the Wayback
 * Machine's first snapshot, and (when the site's GitHub repository is known) its recent commits. All read-only,
 * each with a short timeout, and nothing is kept.
 */

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; TagSpy/2.0; +https://thejayant.in)", Accept: "*/*" };
const within = (signal: AbortSignal | undefined, ms: number) => (signal ? AbortSignal.any([AbortSignal.timeout(ms), signal]) : AbortSignal.timeout(ms));
const firstLines = (text: string) => text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3).join(" · ").slice(0, 180);

/** A file counts only when it is really there: single-page apps answer every path with their index.html. */
async function readFile(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const { response, body } = await safeFetch(url, { headers: HEADERS, signal: within(signal, 5000) }, { redirects: 1, bytes: 200_000 });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || /text\/html/i.test(type) || /^\s*<(?:!doctype|html|head|body|\?xml)/i.test(body.slice(0, 200)) || body.trim().length < 12) return null;
    return body;
  } catch {
    return null;
  }
}

/**
 * Coding-agent instructions talk about building software. Stores now also publish AGENTS.md for AI shopping agents
 * ("how AI agents can interact with our store"), which says nothing about how the site was built.
 */
const DEV_TERMS = /\b(?:npm|pnpm|yarn|bun|npx|build|lint(?:ing)?|tests?|typescript|tsx|jsx|repo(?:sitory)?|codebase|commits?|src\/|components?|dev server|pull requests?|refactor|eslint|prettier|vite|next\.js|tailwind)\b/gi;
export const isDevInstructions = (path: string, body: string) => {
  if (path === "/.replit") return /^\s*(?:run|modules|entrypoint)\s*=|\[nix\]/m.test(body);
  if (path.endsWith(".json")) return true;
  return new Set((body.match(DEV_TERMS) ?? []).map((term) => term.toLowerCase())).size >= 3;
};

/** Agent instruction files (CLAUDE.md, AGENTS.md, .cursorrules …) the site serves from its root. */
export async function agentFiles(origin: string, signal?: AbortSignal): Promise<AiEvidence[]> {
  // A server that answers a made-up path with 200 would make every probe look real.
  if (await readFile(`${origin}/tagspy-${Math.random().toString(36).slice(2, 10)}.md`, signal)) return [];
  const found = await Promise.all(AGENT_FILES.map(async (file) => {
    const body = await readFile(`${origin}${file.path}`, signal);
    if (!body) return null;
    if (file.path.endsWith(".json")) { try { JSON.parse(body); } catch { return null; } }
    if (!isDevInstructions(file.path, body)) return null;
    return {
      id: `file-${file.path}`, tier: "file", tool: file.tool, title: `Public ${file.title}`,
      why: `${AI_TOOLS[file.tool].name} reads this file to follow a project's conventions. It was published along with the site, so the project was set up to be worked on with ${AI_TOOLS[file.tool].name}.`,
      where: file.path, snippet: firstLines(body), ratio: 25,
    } satisfies AiEvidence;
  }));
  return found.filter((item): item is NonNullable<typeof item> => item !== null);
}

const asDate = (stamp: unknown) => (typeof stamp === "string" && /^\d{8}/.test(stamp) ? `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}` : null);

/**
 * The Wayback Machine's earliest snapshot of the host, as YYYY-MM-DD. The CDX index lists captures oldest first; it is
 * slow but reliable (the lookup runs while the browser renders). The availability API is the fallback: it is fast but
 * often answers with no snapshots for well-archived sites.
 */
export async function firstArchived(host: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const { response, body } = await safeFetch(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(host)}&limit=1&fl=timestamp`, { headers: HEADERS, signal: within(signal, 14_000) }, { redirects: 2, bytes: 10_000 });
    const date = response.ok ? asDate(body.trim()) : null;
    if (date) return date;
  } catch { /* try the availability API */ }
  try {
    const { response, body } = await safeFetch(`https://archive.org/wayback/available?url=${encodeURIComponent(host)}&timestamp=19960101`, { headers: { ...HEADERS, Accept: "application/json" }, signal: within(signal, 5000) }, { redirects: 2, bytes: 100_000 });
    return response.ok ? asDate(JSON.parse(body)?.archived_snapshots?.closest?.timestamp) : null;
  } catch {
    return null;
  }
}

/**
 * The site's own GitHub repository, when we can tell which one it is: a *.github.io site, or a single repository link
 * whose name matches the site's name (a "View source" link, not a library it uses).
 */
export function repoFor(host: string, path: string, links: string[]): string | null {
  const pages = /^([\w-]+)\.github\.io$/i.exec(host);
  if (pages) {
    const segment = path.split("/").filter(Boolean)[0];
    return `${pages[1]}/${segment && /^[\w.-]+$/.test(segment) ? segment : `${pages[1]}.github.io`}`;
  }
  const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const label = squash(host.replace(/^www\./, "").split(".")[0]);
  const matching = links.filter((repo) => { const name = squash(repo.split("/")[1] ?? ""); return name.length >= 4 && (name.includes(label) || label.includes(name)); });
  return matching.length === 1 ? matching[0] : null;
}

interface Commit { commit?: { message?: string; author?: { name?: string; email?: string } }; author?: { login?: string } | null; committer?: { login?: string } | null; html_url?: string }

/** Marks AI tools leave in a repository: bot commit authors, commit trailers, and agent files in the root. */
export async function repoEvidence(repo: string, signal?: AbortSignal): Promise<AiEvidence[]> {
  const token = envString("GITHUB_TOKEN");
  const headers = { ...HEADERS, Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const get = async <T>(path: string): Promise<T | null> => {
    try {
      const { response, body } = await safeFetch(`https://api.github.com/repos/${repo}${path}`, { headers, signal: within(signal, 7000) }, { redirects: 2, bytes: 3_000_000 });
      return response.ok ? (JSON.parse(body) as T) : null;
    } catch { return null; }
  };
  const [commits, contents] = await Promise.all([get<Commit[]>("/commits?per_page=60"), get<{ name: string }[]>("/contents")]);
  const evidence: AiEvidence[] = [];
  const where = `github.com/${repo}`;
  if (Array.isArray(commits)) {
    for (const mark of COMMIT_MARKS) {
      const hits = commits.filter((item) => mark.pattern.test([item.commit?.message, item.commit?.author?.name, item.commit?.author?.email, item.author?.login, item.committer?.login].filter(Boolean).join("\n")));
      if (!hits.length) continue;
      const first = hits[0];
      evidence.push({
        id: `repo-${mark.tool}`, tier: "file", tool: mark.tool, title: `${mark.title} (${hits.length} of the last ${commits.length})`,
        why: `The site's public repository records ${AI_TOOLS[mark.tool].name} as the author of recent changes.`,
        where, snippet: firstLines(`${first.author?.login ?? first.commit?.author?.name ?? ""}: ${first.commit?.message ?? ""}`), ratio: 40,
      });
    }
  }
  if (Array.isArray(contents)) {
    const names = new Set(contents.map((item) => item.name));
    const roots: [string, keyof typeof AI_TOOLS, string][] = [
      ["CLAUDE.md", "claude-code", "CLAUDE.md"], [".claude", "claude-code", ".claude folder"], ["AGENTS.md", "codex", "AGENTS.md"], ["GEMINI.md", "gemini", "GEMINI.md"],
      [".cursorrules", "cursor", ".cursorrules"], [".cursor", "cursor", ".cursor folder"], [".windsurfrules", "windsurf", ".windsurfrules"], ["replit.md", "replit", "replit.md"],
      [".replit", "replit", ".replit"], [".bolt", "bolt", ".bolt folder"], [".lovable", "lovable", ".lovable folder"],
    ];
    for (const [name, tool, label] of roots) {
      if (!names.has(name) || evidence.some((item) => item.tool === tool && item.id.startsWith("repo-file"))) continue;
      evidence.push({ id: `repo-file-${name}`, tier: "file", tool, title: `${label} in the repository`, why: `${AI_TOOLS[tool].name} keeps its instructions or state in ${label}; the repository has one.`, where, snippet: `${repo}/${name}`, ratio: 20 });
    }
  }
  return evidence;
}
