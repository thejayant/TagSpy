import { createHash } from "node:crypto";
import type { Ga4Report } from "./ga4/types";
import type { GtmContainer, GtmTag } from "./gtm/types";
import type { MetaPixelReport } from "./meta/types";
import type { SegmentDestination, SegmentReport } from "./segment/types";
import type { SiteFingerprint } from "./site/fingerprint";

export interface DiffEntry {
  area: string;
  change: "added" | "removed" | "changed";
  label: string;
  detail?: string;
}

// Fetch metadata and derived summaries (scores, insights) never count as a configuration change.
const VOLATILE = new Set(["fetchedAt", "sourceUrl", "weightBytes", "weightLabel", "score", "insights"]);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !VOLATILE.has(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

/** Content hash that ignores fetch time and byte size, so re-reading an unchanged setup never creates a new version. */
export function contentHash(model: Ga4Report | GtmContainer | MetaPixelReport | SegmentReport | SiteFingerprint): string {
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

export function diffMeta(before: MetaPixelReport, after: MetaPixelReport): DiffEntry[] {
  const onOff = (label: string, a: boolean, b: boolean): DiffEntry[] => (a === b ? [] : [{ area: "Settings", change: "changed", label, detail: b ? "Turned on" : "Turned off" }]);
  const blocked = (report: MetaPixelReport) => report.restrictions.blockedParams.flatMap((item) => [...item.urlParams.map((key) => `${item.event}: URL ${key}`), ...item.customData.map((key) => `${item.event}: data ${key}`)]);
  return [
    ...keyed("Codeless events", before.codelessEvents, after.codelessEvents, (rule) => rule.id, (rule) => rule.sentence, (a, b) => (a.active !== b.active ? (b.active ? "Activated" : "Deactivated") : "Conditions changed")),
    ...listDiff("Advanced matching", before.automaticMatching.keys.map((key) => key.label), after.automaticMatching.keys.map((key) => key.label)),
    ...listDiff("Features", before.features.map((feature) => feature.name), after.features.map((feature) => feature.name)),
    ...listDiff("Blocked parameters", blocked(before), blocked(after)),
    ...listDiff("Restricted events", before.restrictions.restrictedEvents, after.restrictions.restrictedEvents),
    ...listDiff("Unverified events", before.restrictions.unverifiedEvents, after.restrictions.unverifiedEvents),
    ...listDiff("Click IDs", before.identity.clickIdParams.map((item) => item.param), after.identity.clickIdParams.map((item) => item.param)),
    ...onOff("Conversions API Gateway", before.conversionsApiGateway, after.conversionsApiGateway),
    ...onOff("Automatic advanced matching", before.automaticMatching.enabled, after.automaticMatching.enabled),
    ...keyed("Rollout flags", before.rolloutFlags, after.rolloutFlags, (flag) => flag.name, (flag) => flag.label, (_, b) => (b.on ? "Turned on" : "Turned off")),
  ];
}

export function diffSegment(before: SegmentReport, after: SegmentReport): DiffEntry[] {
  const destinationDetail = (a: SegmentDestination, b: SegmentDestination) => {
    const parts: string[] = [];
    if (a.mode !== b.mode) parts.push(`${a.mode} → ${b.mode} mode`);
    if (a.version !== b.version) parts.push(`version ${a.version ?? "?"} → ${b.version ?? "?"}`);
    if (!same(a.consentCategories, b.consentCategories)) parts.push("consent categories");
    if (!same(a.settings, b.settings)) parts.push("settings");
    if (!same(a.subscriptions, b.subscriptions)) parts.push("mappings");
    return parts.length ? `Changed ${parts.join(", ")}` : undefined;
  };
  const planned = (report: SegmentReport) => report.trackingPlan.events.filter((event) => event.enabled).map((event) => event.name);
  return [
    ...keyed("Destinations", before.destinations, after.destinations, (item) => item.name, (item) => item.name, destinationDetail),
    ...listDiff("Tracking plan", planned(before), planned(after)),
    ...(before.trackingPlan.enforced !== after.trackingPlan.enforced ? [{ area: "Tracking plan", change: "changed" as const, label: "Unplanned events", detail: after.trackingPlan.enforced ? "Now blocked" : "Now allowed" }] : []),
    ...listDiff("Consent categories", before.consent.categories, after.consent.categories),
    ...keyed("Rules", before.rules, after.rules, (rule) => `${rule.destination}:${rule.expression}`, (rule) => `${rule.destination}: ${rule.sentence}`),
    ...(before.library.apiHost !== after.library.apiHost ? [{ area: "Library", change: "changed" as const, label: "Event endpoint", detail: `${before.library.apiHost} → ${after.library.apiHost}` }] : []),
    ...(before.library.version !== after.library.version ? [{ area: "Library", change: "changed" as const, label: "Analytics.js version", detail: `${before.library.version ?? "?"} → ${after.library.version ?? "?"}` }] : []),
  ];
}

/** What changed between two scans of a website: stack, versions, typefaces, palette and hosting. */
export function diffSite(before: SiteFingerprint, after: SiteFingerprint): DiffEntry[] {
  const overlap = after.colors.filter((color) => before.colors.includes(color)).length;
  const paletteShift = before.colors.length && after.colors.length && overlap < Math.min(before.colors.length, after.colors.length) / 2;
  return [
    ...keyed("Stack", before.techs, after.techs, (tech) => tech.name, (tech) => `${tech.name}${tech.version ? ` ${tech.version}` : ""} (${tech.category})`, (a, b) => (a.version !== b.version ? `version ${a.version ?? "?"} → ${b.version ?? "?"}` : undefined)),
    ...listDiff("Typography", before.fonts, after.fonts),
    ...listDiff("Hosting", before.hosting, after.hosting),
    ...(paletteShift ? [{ area: "Design", change: "changed" as const, label: "Color palette", detail: `${after.colors.length - overlap} of the top ${after.colors.length} colors are new: likely a redesign` }] : []),
  ];
}
