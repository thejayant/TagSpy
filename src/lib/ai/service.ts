import { renderSite } from "../site/render";
import { scanSite, type ScanFiles } from "../site/scan";
import type { SiteReport } from "../site/types";
import { builderNote, collectEvidence, scoreEvidence, sortEvidence, type AiCorpus } from "./detect";
import { AI_PROBE, type AiPageProbe } from "./probe";
import { agentFiles, firstArchived, repoEvidence, repoFor } from "./sources";
import type { AiReport } from "./types";

type Log = (text: string, level?: "info" | "ok" | "warn") => void;
export type AiStage = "code" | "render" | "history" | "match" | "verdict";
type Stage = (stage: AiStage, state: "active" | "done", detail?: string) => void;

/** Caps on what the fingerprints run over, so matching stays fast inside the function's time limit. */
const MAX_JS = 16_000_000;
const MAX_MAP_SOURCES = 4_000_000;

/** Original source files from public source maps, the site's own code only (not node_modules). */
function mapSources(maps: ScanFiles["maps"]): { url: string; text: string }[] {
  const output: { url: string; text: string }[] = [];
  let bytes = 0;
  interface Raw { sources?: string[]; sourcesContent?: (string | null)[]; sections?: { map?: Raw }[] }
  const walk = (map: Raw) => {
    map.sections?.forEach((section) => section.map && walk(section.map));
    (map.sources ?? []).forEach((path, index) => {
      const text = map.sourcesContent?.[index];
      if (!text || /node_modules|\/\.vite\/deps\//.test(path) || bytes > MAX_MAP_SOURCES) return;
      bytes += text.length;
      output.push({ url: path, text });
    });
  };
  for (const map of maps) { try { walk(JSON.parse(map.body)); } catch { /* not a map */ } }
  return output;
}

/**
 * Checks whether a website was built with AI tools. The site is read the way Site DNA reads it (HTML, JavaScript, CSS,
 * source maps) and rendered in a real browser at the same time; public agent files and the Wayback Machine are asked
 * in parallel. Nothing is stored: the report goes to the visitor who asked for it.
 */
export async function detectAi(url: string, options: { log?: Log; stage?: Stage; signal?: AbortSignal } = {}): Promise<AiReport> {
  const log = options.log ?? (() => {});
  const stage = options.stage ?? (() => {});
  const signal = options.signal;
  const started = Date.now();
  const target = new URL(url);

  let files: ScanFiles | null = null;
  const collect = (value: ScanFiles) => { files = value; };
  stage("code", "active");
  stage("render", "active");
  stage("history", "active");
  const staticScan = scanSite({ url }, () => {}, signal, collect).then((report) => { stage("code", "done", `${report.totals.scripts} scripts, ${report.totals.styles} stylesheets${report.sourceMaps.length ? `, ${report.sourceMaps.length} source maps` : ""}`); return report; });
  const rendering = renderSite(url, log, signal, { probe: AI_PROBE, reducedMotion: false, scrollShots: false }).then((result) => { stage("render", "done", `${result.runtime.network.requests} requests in ${(result.runtime.durationMs / 1000).toFixed(1)} s`); return result; });
  const lookups = Promise.all([agentFiles(target.origin, signal), firstArchived(target.hostname, signal)]).then((result) => { stage("history", "done", result[1] ? `First archived ${result[1].slice(0, 4)}` : "Agent files and archive checked"); return result; });

  const [scanned, render, [filesFound, archived]] = await Promise.all([staticScan.catch((error: Error) => error), rendering, lookups]);
  signal?.throwIfAborted();
  let report: SiteReport;
  if (!(scanned instanceof Error)) report = scanned;
  else {
    // Sites that refuse plain requests often serve a real browser: read the code the browser was given.
    if (!render.html || render.runtime.blocked) throw scanned;
    log("The site refused a plain read, so the code comes from the page as the browser rendered it", "warn");
    report = await scanSite({ html: render.html, baseUrl: render.runtime.finalUrl }, () => {}, signal, collect);
    stage("code", "done", `${report.totals.scripts} scripts read through the browser`);
  }
  if (render.runtime.blocked) log(render.runtime.blocked, "warn");

  const probe = (render.extra ?? null) as AiPageProbe | null;
  const repo = repoFor(new URL(render.runtime.finalUrl || url).hostname, target.pathname, probe?.repoLinks ?? []);
  stage("match", "active", repo ? `Reading github.com/${repo}` : undefined);
  const repoFound = repo ? await repoEvidence(repo, signal) : [];

  const scannedFiles = files as ScanFiles | null;
  const seen = new Set<string>();
  let jsBytes = 0;
  const js = [...(scannedFiles?.js ?? []), ...render.scripts].filter((file) => {
    const key = file.url.split("#")[0];
    if (seen.has(key) || jsBytes > MAX_JS) return false;
    seen.add(key);
    jsBytes += file.text.length;
    return true;
  });
  const corpus: AiCorpus = {
    host: new URL(render.runtime.finalUrl || url).hostname,
    html: [scannedFiles?.html ?? "", render.html],
    headers: scannedFiles?.headers ?? {},
    urls: [...new Set([...report.assets.map((asset) => asset.url), ...render.scriptUrls, ...(probe?.imageHosts.map((item) => `https://${item.host}/`) ?? [])])],
    js,
    css: scannedFiles?.css ?? [],
    maps: mapSources(scannedFiles?.maps ?? []),
    probe,
    found: [...filesFound, ...repoFound],
    firstArchived: archived,
    stack: report.techs.map((tech) => tech.name),
  };
  const evidence = sortEvidence(collectEvidence(corpus));
  stage("match", "done", `${evidence.filter((item) => item.ratio > 1).length} AI signals, ${evidence.filter((item) => item.ratio < 1).length} against`);

  stage("verdict", "active");
  const coverage: AiReport["coverage"] = {
    rendered: !render.runtime.blocked && !!probe,
    scripts: js.length,
    stylesheets: corpus.css.length,
    sourceMaps: report.sourceMaps.length,
    textChars: probe?.text.length ?? 0,
    agentFiles: filesFound.length,
    repo,
    firstArchived: archived,
  };
  const scored = scoreEvidence(evidence, coverage);
  const notes = [
    builderNote(corpus.stack),
    render.runtime.blocked ? "Bot protection answered the browser, so the rendered page could not be checked." : null,
    render.runtime.partial ? "The page took too long to render; some of it may not have been checked." : null,
    report.totals.failed ? `${report.totals.failed} file${report.totals.failed === 1 ? "" : "s"} could not be read.` : null,
  ].filter((item): item is string => !!item);
  stage("verdict", "done");

  return {
    url, finalUrl: render.runtime.finalUrl || report.finalUrl, host: report.host, checkedAt: new Date().toISOString(), durationMs: Date.now() - started,
    ...scored, evidence, coverage,
    stack: report.techs.filter((tech) => !tech.implied).slice(0, 14).map((tech) => ({ name: tech.name, category: tech.category })),
    screenshot: render.runtime.screenshots[0]?.src || null,
    notes,
  };
}
