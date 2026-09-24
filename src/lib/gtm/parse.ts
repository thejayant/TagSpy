import { asNumber, asString, macroRefs, parseCompiled, type JsonObject } from "../compiled";
import {
  BUILT_IN_DLV, CUSTOM_EVENT, LISTENER_TAGS, LISTENER_TRIGGER, TRIGGER_BY_EVENT, VARIABLE_TYPES, VENDORS,
  humanizeKey, tagTypeInfo, type TriggerTypeInfo,
} from "./catalog";
import type { Condition, DestinationGroup, GtmContainer, GtmTag, GtmTrigger, GtmVariable, Param, ParamValue, TypeCount } from "./types";

const OPERATORS: Record<string, [string, string]> = {
  _eq: ["equals", "does not equal"],
  _cn: ["contains", "does not contain"],
  _sw: ["starts with", "does not start with"],
  _ew: ["ends with", "does not end with"],
  _re: ["matches RegEx", "does not match RegEx"],
  _css: ["matches CSS selector", "does not match CSS selector"],
  _lt: ["less than", "not less than"],
  _le: ["less than or equal to", "greater than"],
  _gt: ["greater than", "not greater than"],
  _ge: ["greater than or equal to", "less than"],
  _lc: ["is in list", "is not in list"],
};

const URL_COMPONENTS: Record<string, string> = { URL: "Page URL", PATH: "Page Path", HOST: "Page Hostname", QUERY: "URL Query", FRAGMENT: "URL Fragment", PROTOCOL: "URL Protocol", PORT: "URL Port", EXTENSION: "URL Extension" };
const AEV_TYPES: Record<string, string> = { TEXT: "Click Text", ELEMENT: "Click Element", CLASSES: "Click Classes", ID: "Click ID", TARGET: "Click Target", URL: "Click URL", ATTRIBUTE: "Element Attribute", HISTORY_NEW_URL_FRAGMENT: "New History Fragment" };
const ID_PATTERN = /\b(?:G|GT|AW|DC|UA|MC)-[A-Z0-9-]{4,}\b/g;

const fnName = (value: unknown) => (asString(value) ?? "").replace(/^__/, "");
const truncate = (value: string, length = 48) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

function uniqueNames<T extends { name: string; index: number }>(items: T[], suffix: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  for (const item of items) if ((counts.get(item.name) ?? 0) > 1) item.name = `${item.name} · ${suffix(item)}`;
}

function vendorFromCode(code: string): { name: string; ids: string[] } | undefined {
  for (const vendor of VENDORS) {
    if (!vendor.pattern.test(code)) continue;
    const ids = vendor.idPattern ? [...code.matchAll(vendor.idPattern)].map((match) => match.slice(1).find(Boolean)!).filter(Boolean) : [];
    return { name: vendor.name, ids: [...new Set(ids)] };
  }
  return undefined;
}

function vendorFromTemplate(tag: JsonObject): { name: string; ids: string[] } | undefined {
  const text = JSON.stringify(tag);
  if (typeof tag.vtp_pixelId === "string" && /standardEventName|fbq|facebook|advancedMatching/i.test(text)) return { name: "Meta Pixel", ids: [tag.vtp_pixelId] };
  if (/tiktok|pixel_code|ttq/i.test(text)) return { name: "TikTok Pixel", ids: typeof tag.vtp_pixel_code === "string" ? [tag.vtp_pixel_code] : [] };
  if (/clarity/i.test(text)) return { name: "Microsoft Clarity", ids: [] };
  if (/linkedin|partnerId/i.test(text)) return { name: "LinkedIn Insight", ids: typeof tag.vtp_partnerId === "string" ? [tag.vtp_partnerId] : [] };
  if (/hotjar/i.test(text)) return { name: "Hotjar", ids: [] };
  return vendorFromCode(text);
}

function idLabel(id: string, vendor?: string): string {
  if (id.startsWith("UA-")) return "Universal Analytics";
  if (id.startsWith("G-")) return "GA4";
  if (id.startsWith("GT-")) return "Google tag";
  if (id.startsWith("AW-")) return "Google Ads";
  if (id.startsWith("DC-")) return "Floodlight";
  if (id.startsWith("MC-")) return "Merchant Center";
  return vendor ?? "ID";
}

export function parseGtm(source: string, containerId: string, sourceUrl: string): GtmContainer {
  const data = parseCompiled(source);
  if (!data) throw new Error("The public container response did not contain a readable configuration.");
  const { macros, tags: rawTags, predicates, rules } = data.resource;

  // ── Variables ───────────────────────────────────────────────────────────
  const eventMacros = new Set<number>();
  const triggersMacros = new Set<number>();
  const variables: GtmVariable[] = [];
  const variableById = new Map<number, GtmVariable>();
  macros.forEach((macro, index) => {
    const fn = fnName(macro.function);
    if (fn === "e") { eventMacros.add(index); return; }
    if (fn === "v" && macro.vtp_name === "gtm.triggers") triggersMacros.add(index);
    const info = VARIABLE_TYPES[fn] ?? (fn.startsWith("cvt_") ? { name: `Custom Template (${fn})`, icon: "extension" } : { name: humanizeKey(fn), icon: "data_object" });
    const dlvName = asString(macro.vtp_name);
    let name = info.name;
    let value = "";
    let builtIn = false;
    let description: string | undefined;
    switch (fn) {
      case "v": {
        const builtin = dlvName && macro.vtp_dataLayerVersion === 1 ? BUILT_IN_DLV[dlvName] : undefined;
        value = dlvName ?? "";
        if (builtin) { name = builtin.name; builtIn = true; description = `Built-in variable reading "${dlvName}" from the data layer.`; }
        else name = `Data Layer Variable — ${value}`;
        break;
      }
      case "u": {
        const component = asString(macro.vtp_component) ?? "URL";
        value = component;
        name = URL_COMPONENTS[component] ?? `URL — ${component}`;
        if (component === "QUERY" && typeof macro.vtp_queryKey === "string") { name = `URL Query — ${macro.vtp_queryKey}`; value = `QUERY · ${macro.vtp_queryKey}`; }
        builtIn = ["URL", "PATH", "HOST"].includes(component) && !macro.vtp_queryKey && !macro.vtp_customUrlSource;
        description = component === "URL" ? "Returns the full URL of the current page." : `Returns the ${component.toLowerCase()} component of the current page URL.`;
        break;
      }
      case "f": builtIn = !macro.vtp_customUrlSource; name = "Referrer"; value = asString(macro.vtp_component) ?? "URL"; description = "Returns the HTTP referrer of the current page."; break;
      case "aev": value = asString(macro.vtp_varType) ?? ""; name = AEV_TYPES[value] ?? `Auto-Event Variable — ${value}`; builtIn = !!AEV_TYPES[value] && !macro.vtp_attribute; break;
      case "c": value = String(macro.vtp_value ?? ""); name = `Constant — ${truncate(value, 40)}`; break;
      case "k": value = asString(macro.vtp_name) ?? ""; name = `1st-Party Cookie — ${value}`; break;
      case "j": value = asString(macro.vtp_name) ?? ""; name = `JavaScript Variable — ${value}`; break;
      case "d": value = asString(macro.vtp_elementSelector) ?? asString(macro.vtp_elementId) ?? ""; name = `DOM Element — ${truncate(value, 40)}`; break;
      case "jsm": {
        const js = macro.vtp_javascript;
        const code = Array.isArray(js) ? js.slice(js[0] === "template" ? 1 : 0).map((part) => (typeof part === "string" ? part : "{{…}}")).join("") : asString(js) ?? "";
        value = code;
        const returned = /return\s+([^;\n}]{1,60})/.exec(code)?.[1]?.trim();
        name = returned ? `Custom JavaScript — ${truncate(returned, 40)}` : "Custom JavaScript";
        break;
      }
      case "gas": value = asString(macro.vtp_trackingId) ?? "macro"; name = `Google Analytics Settings — ${value}`; break;
      case "awec": value = asString(macro.vtp_mode) ?? ""; name = `User-Provided Data — ${value}`; break;
      case "analytics_storage": value = asString(macro.vtp_dataField) ?? ""; name = `Analytics Storage — ${value}`; break;
      case "smm": case "remm": name = `${info.name} — {{input}}`; value = `${Array.isArray(macro.vtp_map) ? macro.vtp_map.length - 1 : 0} rows`; break;
      case "ctv": case "cid": case "dbg": case "r": case "t": case "hid": builtIn = true; break;
      default: value = asString(macro.vtp_name) ?? asString(macro.vtp_value) ?? "";
    }
    const variable: GtmVariable = {
      id: `var${index}`, index, fn, name, type: info.name, icon: info.icon, builtIn, value, params: [],
      ...(description ? { description } : {}), usedBy: { tags: [], triggers: [], variables: [] }, unused: false,
    };
    variables.push(variable);
    variableById.set(index, variable);
  });
  uniqueNames(variables.filter((item) => !item.builtIn), (item) => `#${item.index}`);

  const varLabel = (index: number) => (eventMacros.has(index) ? "Event" : variableById.get(index)?.name ?? `Variable #${index}`);

  function toText(value: unknown, refs: string[]): string {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (!Array.isArray(value)) return value == null ? "" : JSON.stringify(value);
    if (value[0] === "macro" && typeof value[1] === "number") {
      if (!eventMacros.has(value[1])) refs.push(`var${value[1]}`);
      return `{{${varLabel(value[1])}}}`;
    }
    if (value[0] === "template") return value.slice(1).map((part) => toText(part, refs)).join("");
    if (value[0] === "escape") return toText(value[1], refs);
    if (value[0] === "tag" && typeof value[1] === "number") return `tag #${value[1]}`;
    return JSON.stringify(value);
  }

  function toValue(value: unknown): ParamValue {
    if (typeof value === "boolean") return { kind: "bool", value };
    if (typeof value === "number") return { kind: "number", value };
    if (Array.isArray(value) && value[0] === "list") {
      const items = value.slice(1);
      if (items.length && items.every((item) => Array.isArray(item) && item[0] === "map")) {
        const columns = [...new Set(items.flatMap((item) => (item as unknown[]).slice(1).filter((_, i) => i % 2 === 0).map(String)))];
        const rows = items.map((item) => {
          const entries = item as unknown[];
          return columns.map((column) => {
            const at = entries.findIndex((entry, i) => i % 2 === 1 && entry === column);
            return at > 0 ? toValue(entries[at + 1]) : { kind: "text" as const, text: "", refs: [] };
          });
        });
        return { kind: "table", columns, rows };
      }
      return { kind: "list", items: items.map(toValue) };
    }
    if (Array.isArray(value) && value[0] === "map") {
      const entries = value.slice(1);
      const columns = entries.filter((_, i) => i % 2 === 0).map(String);
      return { kind: "table", columns, rows: [entries.filter((_, i) => i % 2 === 1).map(toValue)] };
    }
    const refs: string[] = [];
    const text = toText(value, refs);
    return { kind: "text", text, refs };
  }

  const paramsOf = (object: JsonObject, skip: string[] = []): Param[] => Object.entries(object)
    .filter(([key]) => key.startsWith("vtp_") && !skip.includes(key.slice(4)))
    .map(([key, value]) => ({ key: key.slice(4), label: humanizeKey(key.slice(4)), value: toValue(value) }));

  macros.forEach((macro, index) => {
    const variable = variableById.get(index);
    if (!variable) return;
    variable.params = paramsOf(macro, ["javascript"]);
    if (variable.fn === "jsm") variable.value = toText(macro.vtp_javascript, []);
  });

  // ── Triggers (one compiled rule = one trigger) ─────────────────────────
  const listenerByUniqueId = new Map<string, JsonObject>();
  for (const tag of rawTags) if (typeof tag.vtp_uniqueTriggerId === "string") listenerByUniqueId.set(tag.vtp_uniqueTriggerId, tag);
  const isListener = (index: number) => LISTENER_TAGS.has(fnName(rawTags[index]?.function));

  const triggers: GtmTrigger[] = rules.map((rule, index) => {
    const clause = (kind: string) => rule.filter((part): part is unknown[] & [string, ...number[]] => Array.isArray(part) && part[0] === kind).flatMap((part) => part.slice(1).filter((item): item is number => typeof item === "number"));
    const conditions: Condition[] = [];
    const variablesUsed = new Set<string>();
    let eventName: string | undefined;
    let eventRegex: string | undefined;
    let uniqueTriggerId: string | undefined;
    for (const [negate, predicateIndexes] of [[false, clause("if")], [true, clause("unless")]] as const) {
      for (const predicateIndex of predicateIndexes) {
        const predicate = predicates[predicateIndex];
        if (!predicate) continue;
        const code = asString(predicate.function) ?? "?";
        const arg0 = predicate.arg0;
        const arg1 = predicate.arg1;
        const macroIndex = Array.isArray(arg0) && arg0[0] === "macro" && typeof arg0[1] === "number" ? arg0[1] : undefined;
        if (macroIndex !== undefined && eventMacros.has(macroIndex) && !negate) {
          if (code === "_eq" && typeof arg1 === "string") { eventName = arg1; continue; }
          if (code === "_re" && typeof arg1 === "string") { eventRegex = arg1; continue; }
        }
        if (macroIndex !== undefined && triggersMacros.has(macroIndex) && typeof arg1 === "string") {
          uniqueTriggerId = /\(\^\|,\)([^()$|]+)\(\$\|,\)/.exec(arg1)?.[1] ?? uniqueTriggerId;
          continue;
        }
        const refs: string[] = [];
        const left = macroIndex !== undefined ? varLabel(macroIndex) : toText(arg0, refs);
        if (macroIndex !== undefined && !eventMacros.has(macroIndex)) variablesUsed.add(`var${macroIndex}`);
        const right = toText(arg1, refs);
        refs.forEach((ref) => variablesUsed.add(ref));
        const [positive, negative] = OPERATORS[code] ?? [code, `not ${code}`];
        const ignoreCase = predicate.ignore_case === true && code === "_re" ? " (ignore case)" : "";
        conditions.push({ left, ...(macroIndex !== undefined && !eventMacros.has(macroIndex) ? { leftRef: `var${macroIndex}` } : {}), operator: (negate ? negative : positive) + ignoreCase, code, negate, right });
      }
    }
    const listener = uniqueTriggerId ? listenerByUniqueId.get(uniqueTriggerId) : undefined;
    const listenerFn = listener ? fnName(listener.function) : undefined;
    let info: TriggerTypeInfo = eventName ? TRIGGER_BY_EVENT[eventName] ?? CUSTOM_EVENT : CUSTOM_EVENT;
    if (listenerFn && LISTENER_TRIGGER[listenerFn]) {
      const byName = Object.values(TRIGGER_BY_EVENT).find((item) => item.name === LISTENER_TRIGGER[listenerFn]);
      if (byName) info = byName;
    }
    if (eventName === "gtm.triggerGroup") info = { name: "Trigger Group", icon: "layers", exportType: "TRIGGER_GROUP", all: "Trigger Group" };
    const filters = conditions.map((condition) => `${condition.left} ${condition.operator} ${condition.right}`);
    const isCustom = info === CUSTOM_EVENT;
    const eventLabel = eventName ?? (eventRegex ? `/${eventRegex}/` : undefined);
    let name: string;
    if (isCustom) name = eventLabel ? `Custom Event — ${eventLabel}${filters.length ? ` · ${filters.join(" · ")}` : ""}` : filters.length ? `Trigger — ${filters.join(" · ")}` : `Trigger #${index}`;
    else name = filters.length ? `${info.name} — ${filters.join(" · ")}` : info.all;
    const firesTags = clause("add").filter((tagIndex) => rawTags[tagIndex] && !isListener(tagIndex)).map((tagIndex) => `tag${tagIndex}`);
    const blocksTags = clause("block").filter((tagIndex) => rawTags[tagIndex] && !isListener(tagIndex)).map((tagIndex) => `tag${tagIndex}`);
    const when = conditions.length ? `when ${filters.join(" and ")}` : isCustom ? `on every "${eventLabel ?? "matching"}" event` : `on every ${info.name} event`;
    const verb = firesTags.length ? `Fires ${firesTags.length} tag${firesTags.length === 1 ? "" : "s"}` : blocksTags.length ? `Blocks ${blocksTags.length} tag${blocksTags.length === 1 ? "" : "s"}` : "Fires no tags";
    return {
      id: `trg${index}`, index, name, type: info.name, icon: info.icon, exportType: info.exportType,
      ...(eventName ? { eventName } : {}), ...(eventRegex ? { eventRegex } : {}), conditions,
      ...(listener && listenerFn ? { listener: { fn: listenerFn, params: paramsOf(listener, ["uniqueTriggerId"]) } } : {}),
      ...(uniqueTriggerId ? { uniqueTriggerId } : {}),
      firesTags, blocksTags, variablesUsed: [...variablesUsed], unused: !firesTags.length && !blocksTags.length,
      summary: `${verb} ${when}.`,
    };
  });
  uniqueNames(triggers, (item) => `#${item.uniqueTriggerId?.split("_").pop() ?? item.index}`);
  const triggerName = new Map(triggers.map((trigger) => [trigger.id, trigger.name]));

  // ── Tags ────────────────────────────────────────────────────────────────
  const macroIdCache = new Map<number, string[]>();
  const idsInMacro = (index: number, seen = new Set<number>()): string[] => {
    if (macroIdCache.has(index)) return macroIdCache.get(index)!;
    if (seen.has(index)) return [];
    seen.add(index);
    const macro = macros[index];
    const own = JSON.stringify(macro ?? {}).match(ID_PATTERN) ?? [];
    const nested = [...macroRefs(macro)].flatMap((ref) => idsInMacro(ref, seen));
    const ids = [...new Set([...own, ...nested].map((id) => id.toUpperCase()))];
    macroIdCache.set(index, ids);
    return ids;
  };

  const tags: GtmTag[] = [];
  let listenerCount = 0;
  rawTags.forEach((tag, index) => {
    const rawFn = fnName(tag.function);
    if (LISTENER_TAGS.has(rawFn)) { listenerCount++; return; }
    const paused = rawFn === "paused" || tag.paused === true;
    const fn = rawFn === "paused" ? asString(tag.vtp_originalTagType) ?? "unknown" : rawFn;
    const info = tagTypeInfo(fn);
    const firingTriggers = triggers.filter((trigger) => trigger.firesTags.includes(`tag${index}`)).map((trigger) => trigger.id);
    const blockingTriggers = triggers.filter((trigger) => trigger.blocksTags.includes(`tag${index}`)).map((trigger) => trigger.id);
    const html = fn === "html" ? asString(tag.vtp_html) : undefined;
    const vendor = html ? vendorFromCode(html) : fn === "img" ? vendorFromCode(String(tag.vtp_url ?? "")) : fn.startsWith("cvt_") ? vendorFromTemplate(tag) : undefined;
    const refs = [...macroRefs(tag)];
    const ids = new Set<string>([
      ...(JSON.stringify(tag).match(ID_PATTERN) ?? []).map((id) => id.toUpperCase()),
      ...refs.flatMap((ref) => idsInMacro(ref)),
      ...(vendor?.ids ?? []),
    ]);
    const conversionId = asString(tag.vtp_conversionId);
    if (conversionId && /^\d+$/.test(conversionId)) ids.add(`AW-${conversionId}`);
    const params = paramsOf(tag, ["html", "originalTagType"]);
    const text = (key: string) => {
      const value = tag[`vtp_${key}`];
      if (value == null) return undefined;
      return toText(value, []);
    };
    const eventName = text("eventName");
    const measurementId = text("measurementIdOverride") ?? text("measurementId");
    const identifiers: { label: string; value: string }[] = [];
    let summary: string | undefined;
    let name: string;
    const firstTrigger = firingTriggers[0] ? triggerName.get(firingTriggers[0]) : undefined;
    const short = info.short ?? info.name;
    switch (fn) {
      case "gaawe": case "ga4_event":
        if (eventName) identifiers.push({ label: "Event name", value: eventName });
        if (measurementId) identifiers.push({ label: "Measurement ID", value: measurementId });
        summary = eventName ? `Sends the GA4 event "${eventName}"${measurementId ? ` to ${measurementId}` : ""}.` : undefined;
        name = eventName && !eventName.includes("{{") ? `GA4 Event — ${eventName}` : "GA4 Event";
        break;
      case "googtag": {
        const tagId = text("tagId");
        if (tagId) identifiers.push({ label: "Tag ID", value: tagId });
        summary = tagId ? `Loads the Google tag ${tagId} on the page.` : undefined;
        name = tagId ? `Google Tag — ${tagId}` : "Google Tag";
        break;
      }
      case "gaawc":
        if (measurementId) identifiers.push({ label: "Measurement ID", value: measurementId });
        name = measurementId ? `GA4 Configuration — ${measurementId}` : "GA4 Configuration";
        break;
      case "ua": {
        const trackType = text("trackType");
        const trackingIds = [...ids].filter((id) => id.startsWith("UA-"));
        if (trackType) identifiers.push({ label: "Track type", value: trackType });
        if (trackingIds[0]) identifiers.push({ label: "Tracking ID", value: trackingIds[0] });
        name = trackType ? `Universal Analytics — ${trackType}` : "Universal Analytics";
        break;
      }
      case "gclidw": {
        const domains = text("linkerDomains");
        if (domains) identifiers.push({ label: "Linker domains", value: domains });
        name = domains ? `Conversion Linker — ${domains}` : "Conversion Linker";
        break;
      }
      case "awct": case "awcc": case "sp": case "awud": {
        const label = text("conversionLabel");
        if (conversionId) identifiers.push({ label: "Conversion ID", value: `AW-${conversionId}` });
        if (label) identifiers.push({ label: "Conversion label", value: label });
        summary = conversionId ? `Reports ${fn === "sp" ? "remarketing audiences" : "conversions"} to Google Ads account AW-${conversionId}.` : undefined;
        name = `${fn === "awcc" ? "Google Ads Calls" : fn === "sp" ? "Google Ads Remarketing" : fn === "awud" ? "Google Ads User Data" : "Google Ads Conversion"}${conversionId ? ` — AW-${conversionId}${label ? ` / ${label}` : ""}` : ""}`;
        break;
      }
      case "flc": case "fls": {
        const advertiser = text("advertiserId");
        const group = text("groupTag");
        const activity = text("activityTag");
        if (advertiser) identifiers.push({ label: "Advertiser ID", value: `DC-${advertiser}` });
        name = `${info.name}${advertiser ? ` — DC-${advertiser}${group ? ` ${group}/${activity ?? ""}` : ""}` : ""}`;
        break;
      }
      case "html": case "img": {
        if (vendor) identifiers.push({ label: "Vendor", value: vendor.name });
        const metaEvent = html && vendor?.name === "Meta Pixel" ? /fbq\(\s*["']track(?:Custom)?["']\s*,\s*["']([^"']+)["']/.exec(html)?.[1] : undefined;
        const hosts = [...new Set([...(html ?? String(tag.vtp_url ?? "")).matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)].map((match) => match[1].toLowerCase()))];
        summary = hosts.length ? `Injects third-party code that talks to ${hosts.slice(0, 3).join(", ")}${hosts.length > 3 ? "…" : ""}.` : "Runs custom code on the page.";
        name = vendor ? `${info.name} — ${vendor.name}${metaEvent ? ` (${metaEvent})` : ""}` : `${info.name}${firstTrigger ? ` · ${firstTrigger}` : ""}`;
        break;
      }
      default:
        if (fn.startsWith("cvt_") && vendor) {
          identifiers.push({ label: "Vendor", value: vendor.name });
          const templateEvent = text("standardEventName") ?? text("eventName");
          name = `${vendor.name} (template)${templateEvent ? ` — ${templateEvent}` : ""}`;
        } else name = eventName ? `${short} — ${eventName}` : short;
    }
    if (paused) name = `${short} (Paused)${firstTrigger ? ` · ${firstTrigger}` : ""}`;
    if (asString(tag.name)) name = asString(tag.name)!;
    const sequence = (value: unknown) => {
      const decoded = Array.isArray(value) && value[0] === "list" ? value.slice(1) : [];
      const first = decoded.find((item) => Array.isArray(item) && item[0] === "tag" && typeof item[1] === "number") as unknown[] | undefined;
      return first ? { tag: `tag${first[1]}`, stopOnFailure: first[2] === 1 || first[2] === true } : undefined;
    };
    const setupTag = sequence(tag.setup_tags);
    const teardownTag = sequence(tag.teardown_tags);
    const consent = Array.isArray(tag.consent) ? tag.consent.slice(tag.consent[0] === "list" ? 1 : 0).filter((item): item is string => typeof item === "string") : [];
    const group = fn === "html" || fn === "img" || fn.startsWith("cvt_") ? vendor?.name ?? (fn.startsWith("cvt_") ? "Custom templates" : "Custom") : info.group;
    tags.push({
      id: `tag${index}`, index, ...(asNumber(tag.tag_id) !== undefined ? { tagId: asNumber(tag.tag_id) } : {}),
      fn, name, type: info.name, group, icon: info.icon, ...(vendor ? { vendor: vendor.name } : {}), paused, params, identifiers,
      ...(summary ? { summary } : {}), ...(html ? { html } : {}),
      ids: [...ids], firingTriggers, blockingTriggers,
      ...(asNumber(tag.priority) !== undefined ? { priority: asNumber(tag.priority) } : {}),
      firingOption: tag.once_per_load === true ? "Once per page" : tag.once_per_event === true ? "Once per event" : "Unlimited",
      ...(setupTag ? { setupTag } : {}), ...(teardownTag ? { teardownTag } : {}), consent,
      variablesUsed: refs.filter((ref) => !eventMacros.has(ref)).map((ref) => `var${ref}`),
    });
  });
  uniqueNames(tags, (item) => `#${item.tagId ?? item.index}`);

  // ── Variable usage ──────────────────────────────────────────────────────
  for (const tag of tags) for (const ref of tag.variablesUsed) variables.find((item) => item.id === ref)?.usedBy.tags.push(tag.id);
  for (const trigger of triggers) for (const ref of trigger.variablesUsed) variables.find((item) => item.id === ref)?.usedBy.triggers.push(trigger.id);
  macros.forEach((macro, index) => {
    for (const ref of macroRefs(macro)) if (ref !== index) variableById.get(ref)?.usedBy.variables.push(`var${index}`);
  });
  for (const variable of variables) variable.unused = !variable.usedBy.tags.length && !variable.usedBy.triggers.length && !variable.usedBy.variables.length;

  // ── Destinations ────────────────────────────────────────────────────────
  const groups = new Map<string, DestinationGroup>();
  const groupIcon: Record<string, string> = { "Google Analytics": "ga", Google: "google", "Google Ads": "ads", Floodlight: "ads" };
  for (const tag of tags) {
    const group = groups.get(tag.group) ?? { name: tag.group, icon: groupIcon[tag.group] ?? "code", tagCount: 0, pausedCount: 0, ids: [], tagsWithoutId: 0, tags: [] };
    group.tagCount++;
    group.tags.push(tag.id);
    if (tag.paused) group.pausedCount++;
    const relevant = tag.ids.filter((id) => !(tag.group === "Google Ads" && !id.startsWith("AW-")));
    if (!relevant.length) group.tagsWithoutId++;
    for (const id of relevant) if (!group.ids.some((item) => item.id === id)) group.ids.push({ label: idLabel(id, tag.vendor), id });
    groups.set(tag.group, group);
  }
  const destinations = [...groups.values()].sort((a, b) => b.tagCount - a.tagCount);
  const ids = [...new Set(destinations.flatMap((group) => group.ids.map((item) => item.id)))];

  const countBy = <T,>(items: T[], key: (item: T) => string, icon: (item: T) => string): TypeCount[] => {
    const map = new Map<string, TypeCount>();
    for (const item of items) {
      const type = key(item);
      const entry = map.get(type) ?? { type, icon: icon(item), count: 0 };
      entry.count++;
      map.set(type, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  };

  const weightBytes = new TextEncoder().encode(source).length;
  return {
    kind: "gtm",
    id: containerId.toUpperCase(),
    version: data.resource.version ?? (data.blob["1"] != null ? String(data.blob["1"]) : undefined),
    fetchedAt: new Date().toISOString(),
    sourceUrl,
    weightBytes,
    weightLabel: weightBytes < 700_000 ? "Light" : weightBytes < 1_200_000 ? "Medium" : "Heavy",
    tags,
    triggers,
    variables,
    destinations,
    ids,
    listenerCount,
    stats: {
      active: tags.filter((tag) => !tag.paused).length,
      paused: tags.filter((tag) => tag.paused).length,
      tagsWithoutTrigger: tags.filter((tag) => !tag.firingTriggers.length && !isSequenced(tag.id, tags)).length,
      unusedTriggers: triggers.filter((trigger) => trigger.unused).length,
      unusedVariables: variables.filter((variable) => variable.unused).length,
      customCode: tags.filter((tag) => tag.fn === "html").length + variables.filter((variable) => variable.fn === "jsm").length,
      tagsByType: countBy(tags, (tag) => tag.type, (tag) => tag.icon),
      triggersByType: countBy(triggers, (trigger) => trigger.type, (trigger) => trigger.icon),
      variablesByType: countBy(variables, (variable) => variable.type, (variable) => variable.icon),
    },
  };
}

function isSequenced(tagId: string, tags: GtmTag[]): boolean {
  return tags.some((tag) => tag.setupTag?.tag === tagId || tag.teardownTag?.tag === tagId);
}
