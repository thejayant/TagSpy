import { insertChange, listWatches, markWatchChecked, snapshotData, upsertSnapshot, type TargetKind } from "./db";
import { contentHash, diffGa4, diffGtm, type DiffEntry } from "./diff";
import { fetchPublic } from "./fetcher";
import { parseGa4 } from "./ga4/parse";
import type { Ga4Report } from "./ga4/types";
import { parseGtm } from "./gtm/parse";
import type { GtmContainer } from "./gtm/types";
import { deliver } from "./notify";

export interface Inspection<T> {
  model: T;
  source: string;
  snapshotId: number;
  changes: DiffEntry[];
}

async function record<T extends Ga4Report | GtmContainer>(kind: TargetKind, target: string, model: T, version: string | undefined): Promise<{ snapshotId: number; changes: DiffEntry[] }> {
  const { snapshot, previous } = upsertSnapshot(kind, target, version, contentHash(model), model.fetchedAt, model);
  if (!previous) return { snapshotId: snapshot.id, changes: [] };
  const before = snapshotData<T>(previous.id)?.data;
  if (!before) return { snapshotId: snapshot.id, changes: [] };
  const changes = kind === "gtm" ? diffGtm(before as GtmContainer, model as GtmContainer) : diffGa4(before as Ga4Report, model as Ga4Report);
  if (!changes.length) return { snapshotId: snapshot.id, changes };
  const change = insertChange(kind, target, previous, snapshot, changes);
  const watchers = listWatches({ kind, target });
  await Promise.all(watchers.map((watch) => deliver(watch, change, changes)));
  return { snapshotId: snapshot.id, changes };
}

export async function inspectGa4(id: string, options: { fresh?: boolean } = {}): Promise<Inspection<Ga4Report>> {
  const resource = await fetchPublic("gtag", id, options);
  const model = parseGa4(resource.source, id, resource.url);
  model.fetchedAt = resource.fetchedAt;
  const recorded = await record("ga4", model.measurementId, model, model.libraryVersion);
  return { model, source: resource.source, ...recorded };
}

export async function inspectGtm(id: string, options: { fresh?: boolean } = {}): Promise<Inspection<GtmContainer>> {
  const resource = await fetchPublic("gtm", id, options);
  const model = parseGtm(resource.source, id, resource.url);
  model.fetchedAt = resource.fetchedAt;
  const recorded = await record("gtm", model.id, model, model.version);
  return { model, source: resource.source, ...recorded };
}

/** Re-reads a watched target and notifies watchers when its content changed. */
export async function checkTarget(kind: TargetKind, target: string): Promise<{ changed: boolean; changes: DiffEntry[] }> {
  try {
    const result = kind === "gtm" ? await inspectGtm(target, { fresh: true }) : await inspectGa4(target, { fresh: true });
    markWatchChecked(kind, target, result.changes.length ? "changed" : "ok");
    return { changed: result.changes.length > 0, changes: result.changes };
  } catch (error) {
    markWatchChecked(kind, target, "error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
