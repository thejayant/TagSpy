import { dueTargets, insertChange, listWatches, markWatchChecked, snapshotData, upsertSnapshot, type TargetKind } from "./db";
import { contentHash, diffGa4, diffGtm, diffMeta, diffSegment, diffSite, type DiffEntry } from "./diff";
import { fetchMetaConfig, fetchPublic, fetchSegmentSettings } from "./fetcher";
import { parseGa4 } from "./ga4/parse";
import type { Ga4Report } from "./ga4/types";
import { parseGtm } from "./gtm/parse";
import type { GtmContainer } from "./gtm/types";
import { parseMetaPixel } from "./meta/parse";
import type { MetaPixelReport } from "./meta/types";
import { parseSegmentSettings } from "./segment/parse";
import type { SegmentReport } from "./segment/types";
import { deliver } from "./notify";
import { fingerprint, type SiteFingerprint } from "./site/fingerprint";
import { mergeRuntime } from "./site/merge";
import { renderSite } from "./site/render";
import { scanSite } from "./site/scan";
import type { SiteReport } from "./site/types";

export interface Inspection<T> {
  model: T;
  source: string;
  snapshotId: number | null;
  changes: DiffEntry[];
}

/**
 * Scan data is stored only for targets someone follows (or while a follow is being created: `track`). Everything else
 * lives only in the response to the visitor who asked for it.
 */
const followed = async (kind: TargetKind, target: string, track?: boolean) => track || (await listWatches({ kind, target })).length > 0;

async function record<T extends Ga4Report | GtmContainer | MetaPixelReport | SegmentReport>(kind: TargetKind, target: string, model: T, version: string | undefined, track?: boolean): Promise<{ snapshotId: number | null; changes: DiffEntry[] }> {
  if (!(await followed(kind, target, track))) return { snapshotId: null, changes: [] };
  const { snapshot, previous } = await upsertSnapshot(kind, target, version, contentHash(model), model.fetchedAt, model);
  if (!previous) return { snapshotId: snapshot.id, changes: [] };
  const before = (await snapshotData<T>(previous.id))?.data;
  if (!before) return { snapshotId: snapshot.id, changes: [] };
  const changes = kind === "gtm" ? diffGtm(before as GtmContainer, model as GtmContainer)
    : kind === "meta" ? diffMeta(before as MetaPixelReport, model as MetaPixelReport)
    : kind === "segment" ? diffSegment(before as SegmentReport, model as SegmentReport)
    : diffGa4(before as Ga4Report, model as Ga4Report);
  if (!changes.length) return { snapshotId: snapshot.id, changes };
  const change = await insertChange(kind, target, previous, snapshot, changes);
  const watchers = await listWatches({ kind, target });
  await Promise.all(watchers.map((watch) => deliver(watch, change, changes)));
  return { snapshotId: snapshot.id, changes };
}

export async function inspectGa4(id: string, options: { fresh?: boolean; track?: boolean } = {}): Promise<Inspection<Ga4Report>> {
  const resource = await fetchPublic("gtag", id, options);
  const model = parseGa4(resource.source, id, resource.url);
  model.fetchedAt = resource.fetchedAt;
  const recorded = await record("ga4", model.measurementId, model, model.libraryVersion, options.track);
  return { model, source: resource.source, ...recorded };
}

export async function inspectGtm(id: string, options: { fresh?: boolean; track?: boolean } = {}): Promise<Inspection<GtmContainer>> {
  const resource = await fetchPublic("gtm", id, options);
  const model = parseGtm(resource.source, id, resource.url);
  model.fetchedAt = resource.fetchedAt;
  const recorded = await record("gtm", model.id, model, model.version, options.track);
  return { model, source: resource.source, ...recorded };
}

export async function inspectMeta(id: string, options: { fresh?: boolean; track?: boolean } = {}): Promise<Inspection<MetaPixelReport>> {
  const resource = await fetchMetaConfig(id, options);
  const model = parseMetaPixel(resource.source, id, resource.url);
  model.fetchedAt = resource.fetchedAt;
  const recorded = await record("meta", model.pixelId, model, undefined, options.track);
  return { model, source: resource.source, ...recorded };
}

export async function inspectSegment(key: string, options: { fresh?: boolean; track?: boolean } = {}): Promise<Inspection<SegmentReport>> {
  const resource = await fetchSegmentSettings(key, options);
  const model = parseSegmentSettings(resource.source, resource.id, resource.url);
  model.fetchedAt = resource.fetchedAt;
  const recorded = await record("segment", model.writeKey, model, model.library.version ?? undefined, options.track);
  return { model, source: resource.source, ...recorded };
}

type Log = (text: string, level?: "info" | "ok" | "warn") => void;

export class IncompleteScanError extends Error {
  constructor(failed: number) { super(`${failed} file${failed === 1 ? "" : "s"} could not be read (the site may be rate limiting), so the scan was not compared.`); this.name = "IncompleteScanError"; }
}

/**
 * Site DNA scan of a website (or pasted page source). Nothing is cached or stored: the report goes to the visitor who
 * asked and is gone from the server afterwards. The one exception is a site someone follows (or is starting to follow,
 * `track`): its fingerprint is kept so redesigns can be detected. `strict` fails instead of returning an
 * uncompared result when the scan is incomplete (scheduled checks). `signal` stops the scan when the visitor cancels.
 */
export async function inspectSite(input: { url?: string; html?: string }, options: { strict?: boolean; track?: boolean; log?: Log; signal?: AbortSignal } = {}): Promise<{ report: SiteReport; changes: DiffEntry[] }> {
  const log = options.log ?? (() => {});
  const report = await scanSite(input, log, options.signal);
  if (!input.url || !(await followed("site", fingerprint(report).address, options.track))) return { report, changes: [] };
  // Recording must never fail an interactive scan (e.g. a database hiccup); history is a bonus there.
  const changes = await recordSite(report, log).catch((error) => { if (error instanceof IncompleteScanError && options.strict) throw error; return [] as DiffEntry[]; });
  if (changes.length) log(`${changes.length} changes since the last scan`, "warn");
  return { report, changes };
}

/**
 * Stores a followed site's fingerprint. An incomplete scan (files that failed for transient reasons, often rate
 * limiting) is not stored or compared: a missing bundle would look like a removed technology and a false redesign alert.
 */
async function recordSite(report: SiteReport, log: Log): Promise<DiffEntry[]> {
  if (report.totals.failed) {
    log(`${report.totals.failed} file${report.totals.failed === 1 ? "" : "s"} could not be read, so this scan is not compared with history`, "warn");
    throw new IncompleteScanError(report.totals.failed);
  }
  const model = fingerprint(report);
  const { snapshot, previous } = await upsertSnapshot("site", model.address, undefined, contentHash(model), model.fetchedAt, model);
  if (!previous) return [];
  const before = (await snapshotData<SiteFingerprint>(previous.id))?.data;
  if (!before) return [];
  const changes = diffSite(before, model);
  if (!changes.length) return changes;
  const change = await insertChange("site", model.address, previous, snapshot, changes);
  const watchers = await listWatches({ kind: "site", target: model.address });
  await Promise.all(watchers.map((watch) => deliver(watch, change, changes)));
  return changes;
}

/**
 * Deep scan: the static scan and a real browser render run in parallel, then merge, inside one 60 s function.
 * Deep results are never stored. Cancelling (`signal`) closes the browser straight away.
 */
export async function inspectSiteDeep(url: string, options: { log?: Log; signal?: AbortSignal } = {}): Promise<SiteReport> {
  const log = options.log ?? (() => {});
  const [scanned, render] = await Promise.allSettled([inspectSite({ url }, { log, signal: options.signal }), renderSite(url, log, options.signal)]);
  if (render.status === "rejected") throw render.reason;
  const rendered = render.value;
  let report: SiteReport;
  if (scanned.status === "fulfilled") report = scanned.value.report;
  else {
    // Many sites refuse plain HTTP clients but serve a real browser; build the static part from the rendered page.
    if (!rendered.html || rendered.runtime.blocked) throw scanned.reason;
    log("The plain read was refused, so the report is built from the page as the browser rendered it", "warn");
    report = await scanSite({ html: rendered.html, baseUrl: rendered.runtime.finalUrl }, log, options.signal);
    report.limits.unshift("The site refused a plain HTTP read, so the static part of this report comes from the rendered page. Response headers and cookies are missing.");
  }
  return mergeRuntime(report, rendered.runtime, rendered.techs, rendered.scriptUrls);
}

/** Re-reads a watched target and notifies watchers when its content changed. */
export async function checkTarget(kind: TargetKind, target: string): Promise<{ changed: boolean; changes: DiffEntry[] }> {
  try {
    const changes = kind === "site" ? (await inspectSite({ url: `https://${target}` }, { strict: true })).changes
      : (kind === "gtm" ? await inspectGtm(target, { fresh: true }) : kind === "meta" ? await inspectMeta(target, { fresh: true }) : kind === "segment" ? await inspectSegment(target, { fresh: true }) : await inspectGa4(target, { fresh: true })).changes;
    await markWatchChecked(kind, target, changes.length ? "changed" : "ok");
    return { changed: changes.length > 0, changes };
  } catch (error) {
    await markWatchChecked(kind, target, "error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Checks watched targets that are due, least recently checked first, until the time budget runs out. Used by the
 * long-running worker and by the daily Vercel cron (one function run), so a large watch list rotates across runs.
 */
export async function runDueChecks(options: { intervalHours: number; budgetMs: number; log?: (entry: Record<string, unknown>) => void }): Promise<{ checked: number; changed: number; failed: number; remaining: number }> {
  const started = Date.now();
  const due = await dueTargets(new Date(Date.now() - options.intervalHours * 3600_000).toISOString());
  let checked = 0, changed = 0, failed = 0;
  for (const { kind, target } of due) {
    // Leave room for one more check (site scans take the longest) before the budget ends.
    if (Date.now() - started > options.budgetMs - (kind === "site" ? 45_000 : 15_000)) break;
    try {
      const result = await checkTarget(kind, target);
      checked++;
      if (result.changed) changed++;
      options.log?.({ level: "info", event: "watch_checked", kind, target, changed: result.changed, changes: result.changes.length });
    } catch (error) {
      checked++;
      failed++;
      options.log?.({ level: "error", event: "watch_failed", kind, target, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { checked, changed, failed, remaining: due.length - checked };
}
