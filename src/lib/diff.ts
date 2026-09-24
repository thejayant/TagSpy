import { createHash } from "node:crypto";
import type { Ga4Report } from "./ga4/types";
import type { GtmContainer, GtmTag } from "./gtm/types";

export interface DiffEntry {
  area: string;
  change: "added" | "removed" | "changed";
  label: string;
  detail?: string;
}

const VOLATILE = new Set(["fetchedAt", "sourceUrl", "weightBytes", "weightLabel"]);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !VOLATILE.has(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

/** Content hash that ignores fetch time and byte size, so re-reading an unchanged setup never creates a new version. */
export function contentHash(model: Ga4Report | GtmContainer): string {
  return createHash("sha256").update(JSON.stringify(stable(model))).digest("hex");
}

const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

function keyed<T>(area: string, before: T[], after: T[], key: (item: T) => string, label: (item: T) => string, detail?: (a: T, b: T) => string | undefined): DiffEntry[] {
  const output: DiffEntry[] = [];
  const oldMap = new Map(before.map((item) => [key(item), item]));
  const newMap = new Map(after.map((item) => [key(item), item]));
  for (const [id, item] of newMap) {
    const previous = oldMap.get(id);
    if (!previous) output.push({ area, change: "added", label: label(item) });
    else if (!same(previous, item)) output.push({ area, change: "changed", label: label(item), detail: detail?.(previous, item) });
  }
  for (const [id, item] of oldMap) if (!newMap.has(id)) output.push({ area, change: "removed", label: label(item) });
  return output;
}

function listDiff(area: string, before: string[] | null | undefined, after: string[] | null | undefined): DiffEntry[] {
  const a = new Set(before ?? []);
  const b = new Set(after ?? []);
  return [
    ...[...b].filter((item) => !a.has(item)).map((item) => ({ area, change: "added" as const, label: item })),
    ...[...a].filter((item) => !b.has(item)).map((item) => ({ area, change: "removed" as const, label: item })),
  ];
}

const GA4_FIELDS: Array<[keyof Ga4Report, string]> = [
  ["enhancedMeasurement", "Enhanced measurement"], ["redaction", "Redact data"], ["uaEvents", "Collect Universal Analytics events"],
  ["autoEventDetection", "Automatic event detection"], ["internalTrafficRules", "Internal traffic"], ["session", "Session timeout"],
  ["cookies", "Cookie settings"], ["userProvidedData", "User-provided data capabilities"], ["dataUse", "Data use across Google services"],
  ["dataExtraction", "Extract data from your page"], ["connectedTags", "Connected site tags"], ["dataTransmission", "Data transmission"],
  ["consentOverrides", "Consent mode defaults"], ["dmaDefaults", "Default consent settings"], ["googleSignals", "Google Signals"],
  ["granularLocation", "Granular location and device data"], ["userDataCollection", "User-provided data collection"], ["tagSignals", "Tag signals"],
  ["libraryVersion", "Library version"],
];

export function diffGa4(before: Ga4Report, after: Ga4Report): DiffEntry[] {
  const describeRule = (a: Ga4Report["createdEvents"][number], b: Ga4Report["createdEvents"][number]) => {
    const parts: string[] = [];
    if (!same(a.conditions, b.conditions)) parts.push("conditions");
    if (!same(a.operations, b.operations)) parts.push("parameter operations");
    if (a.copyParams !== b.copyParams) parts.push("copy parameters");
    return parts.length ? `Changed ${parts.join(", ")}` : undefined;
  };
  return [
    ...listDiff("Key events", before.keyEvents, after.keyEvents),
    ...keyed("Create custom events", before.createdEvents, after.createdEvents, (item) => item.name, (item) => item.name, describeRule),
    ...keyed("Modify events", before.modifiedEvents, after.modifiedEvents, (item) => `${item.sourceEvent}→${item.name}`, (item) => `${item.sourceEvent ?? "?"} → ${item.name}`, describeRule),
    ...listDiff("Cross-domain", before.crossDomains, after.crossDomains),
    ...listDiff("Unwanted referrals", before.unwantedReferrals, after.unwantedReferrals),
    ...GA4_FIELDS.filter(([key]) => !same(before[key], after[key])).map(([key, label]) => ({
      area: "Settings", change: "changed" as const, label,
      detail: key === "libraryVersion" ? `v${before.libraryVersion} → v${after.libraryVersion}` : undefined,
    })),
  ];
}

export function diffGtm(before: GtmContainer, after: GtmContainer): DiffEntry[] {
  const triggerNames = (container: GtmContainer, tag: GtmTag) => tag.firingTriggers.map((id) => container.triggers.find((item) => item.id === id)?.name ?? id);
  const tagKey = (tag: GtmTag) => (tag.tagId != null ? `id:${tag.tagId}` : `name:${tag.name}`);
  const beforeTags = before.tags.map((tag) => ({ ...tag, firingTriggers: triggerNames(before, tag), blockingTriggers: [], index: 0 }));
  const afterTags = after.tags.map((tag) => ({ ...tag, firingTriggers: triggerNames(after, tag), blockingTriggers: [], index: 0 }));
  const tagDetail = (a: GtmTag, b: GtmTag) => {
    const parts: string[] = [];
    if (a.name !== b.name) parts.push(`renamed from "${a.name}"`);
    if (a.paused !== b.paused) parts.push(b.paused ? "paused" : "unpaused");
    if (!same(a.params, b.params) || a.html !== b.html) parts.push("configuration");
    if (!same(a.firingTriggers, b.firingTriggers)) parts.push("firing triggers");
    return parts.length ? parts.join(", ") : undefined;
  };
  const strip = <T extends { id: string; index: number }>(items: T[]) => items.map((item) => ({ ...item, id: "", index: 0 }));
  return [
    ...(before.version !== after.version ? [{ area: "Container", change: "changed" as const, label: "Published version", detail: `v${before.version ?? "?"} → v${after.version ?? "?"}` }] : []),
    ...keyed("Tags", beforeTags, afterTags, tagKey, (item) => item.name, tagDetail),
    ...keyed("Triggers", strip(before.triggers).map((item) => ({ ...item, firesTags: [], blocksTags: [], variablesUsed: [] })), strip(after.triggers).map((item) => ({ ...item, firesTags: [], blocksTags: [], variablesUsed: [] })), (item) => item.name, (item) => item.name),
    ...keyed("Variables", strip(before.variables).map((item) => ({ ...item, usedBy: {}, unused: false })), strip(after.variables).map((item) => ({ ...item, usedBy: {}, unused: false })), (item) => item.name, (item) => item.name),
  ];
}
