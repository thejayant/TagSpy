import { asString, parseCompiled, type JsonObject } from "../compiled";
import { BUILT_IN_DLV } from "./catalog";
import type { GtmContainer } from "./types";

/** GTM parameter shape used by the official container export/import format. */
interface ExportParam {
  type: "TEMPLATE" | "BOOLEAN" | "INTEGER" | "LIST" | "MAP" | "TAG_REFERENCE";
  key?: string;
  value?: string;
  list?: ExportParam[];
  map?: ExportParam[];
}

const FILTER_TYPES: Record<string, string> = {
  _eq: "EQUALS", _cn: "CONTAINS", _sw: "STARTS_WITH", _ew: "ENDS_WITH", _re: "MATCH_REGEX", _css: "CSS_SELECTOR",
  _lt: "LESS", _le: "LESS_OR_EQUALS", _gt: "GREATER", _ge: "GREATER_OR_EQUALS",
};

const BUILT_IN_BY_NAME: Record<string, string> = {
  Event: "EVENT", "Page URL": "PAGE_URL", "Page Path": "PAGE_PATH", "Page Hostname": "PAGE_HOSTNAME", Referrer: "REFERRER",
  "Click Text": "CLICK_TEXT", "HTML ID": "HTML_ID", "Container Version": "CONTAINER_VERSION", "Container ID": "CONTAINER_ID",
  "Debug Mode": "DEBUG_MODE", "Random Number": "RANDOM_NUMBER", "Environment Name": "ENVIRONMENT_NAME",
  ...Object.fromEntries(Object.values(BUILT_IN_DLV).filter((item) => item.exportType).map((item) => [item.name, item.exportType])),
};

const RENAMED_BUILT_INS: Record<string, string> = { ctv: "Container Version", cid: "Container ID", dbg: "Debug Mode", r: "Random Number", t: "Environment Name" };

export interface ExportResult {
  json: unknown;
  skipped: { name: string; reason: string }[];
}

export function exportContainer(source: string, container: GtmContainer): ExportResult {
  const data = parseCompiled(source);
  if (!data) throw new Error("Container could not be decoded for export.");
  const { macros, tags: rawTags, predicates, rules } = data.resource;
  const skipped: ExportResult["skipped"] = [];

  const variableName = (index: number): string => {
    const macro = macros[index];
    if (asString(macro?.function) === "__e") return "Event";
    const variable = container.variables.find((item) => item.index === index);
    if (!variable) return `Variable ${index}`;
    return RENAMED_BUILT_INS[variable.fn] ?? variable.name;
  };

  const templateText = (value: unknown): string => {
    if (typeof value === "string") return value.replace(/ type="text\/gtmscript"/g, "");
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) {
      if (value[0] === "macro" && typeof value[1] === "number") return `{{${variableName(value[1])}}}`;
      if (value[0] === "template") return value.slice(1).map(templateText).join("");
      if (value[0] === "escape") return templateText(value[1]);
    }
    return value == null ? "" : JSON.stringify(value);
  };

  const toParam = (value: unknown, key?: string): ExportParam => {
    const withKey = <T extends ExportParam>(param: T): T => (key === undefined ? param : { ...param, key });
    if (typeof value === "boolean") return withKey({ type: "BOOLEAN", value: String(value) });
    if (Array.isArray(value) && value[0] === "list") return withKey({ type: "LIST", list: value.slice(1).map((item) => toParam(item)) });
    if (Array.isArray(value) && value[0] === "map") {
      const map: ExportParam[] = [];
      for (let index = 1; index + 1 < value.length; index += 2) map.push(toParam(value[index + 1], String(value[index])));
      return withKey({ type: "MAP", map });
    }
    if (Array.isArray(value) && value[0] === "tag" && typeof value[1] === "number") {
      const tag = container.tags.find((item) => item.index === value[1]);
      return withKey({ type: "TAG_REFERENCE", value: tag?.name ?? `Tag ${value[1]}` });
    }
    return withKey({ type: "TEMPLATE", value: templateText(value) });
  };

  const vtpParams = (object: JsonObject, skip: string[] = []): ExportParam[] => Object.entries(object)
    .filter(([key]) => key.startsWith("vtp_") && !skip.includes(key.slice(4)))
    .map(([key, value]) => toParam(value, key.slice(4)));

  // Variables
  const builtInVariable: { type: string; name: string }[] = [];
  const variable: unknown[] = [];
  for (const item of container.variables) {
    const name = variableName(item.index);
    const builtInType = item.builtIn ? BUILT_IN_BY_NAME[name] : undefined;
    if (item.builtIn) {
      if (builtInType && !builtInVariable.some((entry) => entry.type === builtInType)) builtInVariable.push({ type: builtInType, name });
      if (builtInType || name.startsWith("Trigger IDs")) continue;
    }
    if (item.fn.startsWith("cvt_")) { skipped.push({ name, reason: "Custom template code is not included in the public container." }); continue; }
    const macro = macros[item.index];
    variable.push({
      accountId: "0", containerId: "0", variableId: String(item.index + 1), name, type: item.fn,
      parameter: vtpParams(macro), fingerprint: "0", formatValue: {},
    });
  }
  builtInVariable.push({ type: "EVENT", name: "Event" });

  // Triggers
  const trigger = container.triggers.map((item) => {
    const rule = rules[item.index];
    const filter: unknown[] = [];
    const customEventFilter: unknown[] = [];
    for (const [negate, kind] of [[false, "if"], [true, "unless"]] as const) {
      for (const clause of rule.filter((part) => Array.isArray(part) && part[0] === kind) as unknown[][]) {
        for (const predicateIndex of clause.slice(1)) {
          const predicate = predicates[Number(predicateIndex)];
          if (!predicate) continue;
          const arg0 = predicate.arg0;
          const macroIndex = Array.isArray(arg0) && arg0[0] === "macro" ? Number(arg0[1]) : -1;
          const macro = macros[macroIndex];
          if (macro?.vtp_name === "gtm.triggers") continue;
          const isEvent = asString(macro?.function) === "__e";
          const params: ExportParam[] = [
            { type: "TEMPLATE", key: "arg0", value: isEvent ? "{{_event}}" : templateText(arg0) },
            { type: "TEMPLATE", key: "arg1", value: templateText(predicate.arg1) },
          ];
          if (negate) params.push({ type: "BOOLEAN", key: "negate", value: "true" });
          if (predicate.ignore_case === true) params.push({ type: "BOOLEAN", key: "ignore_case", value: "true" });
          const entry = { type: FILTER_TYPES[String(predicate.function)] ?? "EQUALS", parameter: params };
          // Compiled containers can repeat the same predicate (e.g. two event macros); keep each filter once.
          const target = isEvent ? (item.exportType === "CUSTOM_EVENT" ? customEventFilter : null) : filter;
          if (target && !target.some((existing) => JSON.stringify(existing) === JSON.stringify(entry))) target.push(entry);
        }
      }
    }
    const listenerSettings: Record<string, ExportParam> = {};
    for (const param of item.listener?.params ?? []) {
      const listener = rawTags.find((tag) => tag.vtp_uniqueTriggerId === item.uniqueTriggerId);
      if (listener) listenerSettings[param.key] = toParam(listener[`vtp_${param.key}`]);
    }
    return {
      accountId: "0", containerId: "0", triggerId: String(item.index + 1), name: item.name, type: item.exportType,
      ...(customEventFilter.length ? { customEventFilter } : {}),
      ...(filter.length ? { filter } : {}),
      ...listenerSettings,
      fingerprint: "0",
    };
  });

  // Tags
  const triggerIds = new Map(container.triggers.map((item) => [item.id, String(item.index + 1)]));
  const tag: unknown[] = [];
  for (const item of container.tags) {
    if (item.fn.startsWith("cvt_")) { skipped.push({ name: item.name, reason: "Custom template code is not included in the public container." }); continue; }
    const raw = rawTags[item.index];
    const sequence = (ref?: { tag: string; stopOnFailure: boolean }) => {
      const target = ref ? container.tags.find((entry) => entry.id === ref.tag) : undefined;
      return target ? [{ tagName: target.name, stopOnSetupFailure: ref!.stopOnFailure }] : undefined;
    };
    const setupTag = sequence(item.setupTag);
    const teardownTag = sequence(item.teardownTag);
    tag.push({
      accountId: "0", containerId: "0", tagId: String(item.tagId ?? item.index + 1), name: item.name, type: item.fn,
      parameter: item.paused ? [] : vtpParams(raw, ["originalTagType"]),
      fingerprint: "0",
      firingTriggerId: item.firingTriggers.map((id) => triggerIds.get(id)).filter(Boolean),
      ...(item.blockingTriggers.length ? { blockingTriggerId: item.blockingTriggers.map((id) => triggerIds.get(id)).filter(Boolean) } : {}),
      tagFiringOption: item.firingOption === "Once per page" ? "ONCE_PER_LOAD" : item.firingOption === "Once per event" ? "ONCE_PER_EVENT" : "UNLIMITED",
      ...(item.paused ? { paused: true } : {}),
      ...(typeof item.priority === "number" && item.priority !== 0 ? { priority: { type: "INTEGER", value: String(item.priority) } } : {}),
      ...(setupTag ? { setupTag } : {}),
      ...(teardownTag ? { teardownTag } : {}),
      monitoringMetadata: { type: "MAP" },
      consentSettings: item.consent.length
        ? { consentStatus: "NEEDED", consentType: { type: "LIST", list: item.consent.map((value) => ({ type: "TEMPLATE", value })) } }
        : { consentStatus: "NOT_SET" },
    });
  }

  const now = new Date();
  const exportTime = now.toISOString().replace("T", " ").slice(0, 19);
  return {
    skipped,
    json: {
      exportFormatVersion: 2,
      exportTime,
      containerVersion: {
        path: "accounts/0/containers/0/versions/0",
        accountId: "0",
        containerId: "0",
        containerVersionId: "0",
        name: `Reconstructed from public ${container.id} v${container.version ?? "?"}`,
        description: `Rebuilt from the public published container on ${exportTime} UTC. Names are descriptive reconstructions; paused tags carry no parameters because GTM does not publish them.`,
        container: {
          path: "accounts/0/containers/0", accountId: "0", containerId: "0", name: container.id, publicId: container.id,
          usageContext: ["WEB"], fingerprint: "0", tagManagerUrl: "",
        },
        tag,
        trigger,
        variable,
        builtInVariable,
        fingerprint: "0",
        tagManagerUrl: "",
      },
    },
  };
}
