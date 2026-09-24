import { asBool, asNumber, asString, decode, decodeList, isObject, parseCompiled, stringList, type JsonObject } from "../compiled";
import type { EventCondition, EventRule, Ga4Report, ParamOperation, Toggle } from "./types";

const OPERATORS: Record<string, string> = {
  eq: "equals", cn: "contains", sw: "starts with", ew: "ends with", re: "matches regex",
  lt: "less than", le: "less than or equal", gt: "greater than", ge: "greater than or equal",
};

const EM_ITEMS: Array<[fn: string, key: string, label: string, icon: string]> = [
  ["__ccd_em_page_view", "page_view", "Page views", "visibility"],
  ["__ccd_em_scroll", "scroll", "Scrolls", "swap_vert"],
  ["__ccd_em_outbound_click", "outbound_click", "Outbound clicks", "open_in_new"],
  ["__ccd_em_site_search", "site_search", "Site search", "search"],
  ["__ccd_em_video", "video", "Video engagement", "play_circle"],
  ["__ccd_em_download", "download", "File downloads", "download"],
  ["__ccd_em_form", "form", "Form interactions", "description"],
];

const AUTO_ITEMS: Array<[field: string, key: string, label: string, icon: string]> = [
  ["vtp_enablePageView", "page_view", "Page views", "visibility"],
  ["vtp_enableScroll", "scroll", "Scrolls", "swap_vert"],
  ["vtp_enableOutboundClick", "outbound_click", "Outbound clicks", "open_in_new"],
  ["vtp_enableForm", "form", "Form interactions", "description"],
  ["vtp_enableVideo", "video", "Video engagement", "play_circle"],
  ["vtp_enableDownload", "download", "File downloads", "download"],
];

const HANDLED = new Set([
  "__ogt_auto_events", "__ogt_cross_domain", "__ogt_1p_data_v2", "__ogt_data_extract", "__ogt_session_timeout",
  "__ogt_referral_exclusion", "__ogt_dtc", "__ogt_consent_defaults", "__ogt_dma", "__ogt_cps", "__ogt_google_signals",
  "__ogt_event_create", "__ogt_event_edit", "__ogt_ip_mark", "__ogt_ga_send", "__ccd_ga_first", "__ccd_ga_last",
  "__ccd_ga_regscope", "__ccd_add_ecs", "__ccd_conversion_marking", "__ccd_add_1p_data", "__ccd_auto_redact",
  "__ccd_ga_ads_link", "__dest_ga", "__dest_aw", "__dest_dc", "__gct", "__zone", "__set_product_settings", "__rep",
  "__ogt_ads_datatos", "__ccd_ads_first", "__ccd_ads_last", "__ccd_enable_cm", "__ccd_pre_auto_pii", "__ogt_cookie_settings",
  ...EM_ITEMS.map(([fn]) => fn),
]);

function productFor(id: string): string {
  if (id.startsWith("AW-")) return "Google Ads";
  if (id.startsWith("DC-")) return "Floodlight";
  if (id.startsWith("G-")) return "Google Analytics";
  if (id.startsWith("GT-")) return "Google tag";
  if (id.startsWith("GTM-")) return "Tag Manager";
  if (id.startsWith("MC-")) return "Merchant Center";
  return "Google product";
}

function parseCondition(predicate: unknown): EventCondition | null {
  if (!isObject(predicate)) return null;
  const values = Array.isArray(predicate.values) ? predicate.values.filter(isObject) : [];
  const subject = values.find((item) => item.type === "event_name" || item.type === "event_param");
  const constant = values.find((item) => item.type === "const");
  let parameter = "value";
  if (subject?.type === "event_name") parameter = "event_name";
  else if (isObject(subject?.event_param) && typeof subject.event_param.param_name === "string") parameter = subject.event_param.param_name;
  const code = asString(predicate.type) ?? "?";
  const ignoreCase = code.length > 2 && code.endsWith("i");
  const base = ignoreCase ? code.slice(0, -1) : code;
  const value = constant?.const_value;
  return {
    parameter,
    code,
    ignoreCase,
    operator: OPERATORS[base] ?? code,
    value: value == null ? "" : String(value),
    negate: predicate.negate === true,
  };
}

function predicatesOf(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (isObject(item) && Array.isArray(item.predicates) ? item.predicates : [item]));
}

function paramValueText(value: unknown): { action: ParamOperation["action"]; text: string } {
  if (!isObject(value)) return { action: "SET", text: value == null ? "" : String(value) };
  if (value.type === "const") return { action: "SET", text: String(value.const_value ?? "") };
  if (value.type === "event_param" && isObject(value.event_param)) return { action: "COPY", text: String(value.event_param.param_name ?? "") };
  if (value.type === "event_name") return { action: "COPY", text: "event_name" };
  return { action: "SET", text: JSON.stringify(value) };
}

function parseOperations(value: unknown): ParamOperation[] {
  const output: ParamOperation[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (!isObject(item)) continue;
    if (isObject(item.edit_param)) {
      const parameter = String(item.edit_param.param_name ?? "");
      const { action, text } = paramValueText(item.edit_param.param_value);
      output.push({ action, parameter, value: text });
    } else if (isObject(item.remove_param) || isObject(item.delete_param)) {
      const target = (item.remove_param ?? item.delete_param) as JsonObject;
      output.push({ action: "REMOVE", parameter: String(target.param_name ?? ""), value: "" });
    }
  }
  return output;
}

function parseEventRule(tag: JsonObject, fallbackOrder: number): EventRule {
  const rule = decode(tag.vtp_precompiledRule);
  const decoded = isObject(rule) ? rule : {};
  const sourceConditions = predicatesOf(decoded.event_name_predicate).map(parseCondition).filter((item): item is EventCondition => !!item);
  const extra = predicatesOf(decoded.conditions).map(parseCondition).filter((item): item is EventCondition => !!item);
  const newName = decoded.new_event_name;
  const name = asString(tag.vtp_eventName) ?? (isObject(newName) ? String(newName.const_value ?? "") : asString(newName)) ?? "";
  return {
    order: asNumber(tag.vtp_instanceOrder) ?? asNumber(decoded.instance_order) ?? fallbackOrder,
    name,
    copyParams: tag.vtp_isCopy === true || decoded.merge_source_event_params === true,
    sourceEvent: sourceConditions.find((item) => item.parameter === "event_name")?.value,
    conditions: [...sourceConditions, ...extra],
    operations: parseOperations(decoded.event_param_ops),
  };
}

function keyEventNames(tag: JsonObject): string[] {
  const names: string[] = [];
  for (const rule of decodeList(tag.vtp_conversionRules)) {
    if (!isObject(rule) || typeof rule.matchingRules !== "string") continue;
    try {
      const walk = (node: unknown) => {
        if (Array.isArray(node)) node.forEach(walk);
        else if (isObject(node)) {
          if (typeof node.stringValue === "string") names.push(node.stringValue);
          Object.values(node).forEach(walk);
        }
      };
      walk(JSON.parse(rule.matchingRules));
    } catch {
      /* unknown rule format: skip rather than guess */
    }
  }
  return names;
}

export function parseGa4(source: string, requestedId: string, sourceUrl: string): Ga4Report {
  const data = parseCompiled(source);
  if (!data) throw new Error("The public Google tag response did not contain a readable configuration.");
  const { resource, blob } = data;
  const tags = resource.tags;
  const upper = requestedId.toUpperCase();
  const gaDestinations = [...new Set([
    ...tags.filter((tag) => tag.function === "__dest_ga").map((tag) => asString(tag.vtp_destinationId)?.toUpperCase()),
    ...tags.map((tag) => asString(tag.vtp_instanceDestinationId)?.toUpperCase()).filter((id) => id?.startsWith("G-")),
    ...String(blob["10"] ?? "").split("|").map((id) => id.trim().toUpperCase()).filter((id) => id.startsWith("G-")),
  ].filter((id): id is string => !!id))];
  const measurementId = upper.startsWith("G-") ? upper : gaDestinations[0] ?? upper;
  const scoped = tags.filter((tag) => {
    const destination = asString(tag.vtp_instanceDestinationId)?.toUpperCase();
    return !destination || destination === measurementId;
  });
  const byFn = (fn: string) => scoped.filter((tag) => tag.function === fn);
  const one = (fn: string) => byFn(fn)[0];

  // Events
  const emTags = EM_ITEMS.map(([fn, key, label, icon]) => ({ tag: one(fn), key, label, icon }));
  const pageView = one("__ccd_em_page_view");
  const siteSearch = one("__ccd_em_site_search");
  const splitCsv = (value: unknown) => (asString(value) ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const enhancedMeasurement = emTags.some((item) => item.tag) ? {
    enabled: true,
    items: emTags.map(({ tag, key, label, icon }): Toggle => ({
      key, label, icon, on: !!tag,
      ...(key === "page_view" && pageView && typeof pageView.vtp_historyEvents === "boolean" ? { note: pageView.vtp_historyEvents ? "History on" : "History off" } : {}),
    })),
    ...(siteSearch ? { siteSearch: { queryParams: splitCsv(siteSearch.vtp_searchQueryParams), additionalParams: splitCsv(siteSearch.vtp_additionalQueryParams) } } : {}),
  } : null;

  const createdEvents = byFn("__ogt_event_create").map((tag, index) => parseEventRule(tag, index + 1)).sort((a, b) => a.order - b.order);
  const modifiedEvents = byFn("__ogt_event_edit").map((tag, index) => parseEventRule(tag, index + 1)).sort((a, b) => a.order - b.order);
  const keyEvents = [...new Set(byFn("__ccd_conversion_marking").flatMap(keyEventNames))];
  const redact = one("__ccd_auto_redact");
  const redaction = redact ? { email: redact.vtp_redactEmail === true, queryParams: splitCsv(redact.vtp_redactQueryParams) } : null;
  const gaSend = one("__ogt_ga_send");

  // Google tag
  const auto = one("__ogt_auto_events");
  const autoEventDetection = auto ? {
    items: AUTO_ITEMS.filter(([field]) => typeof auto[field] === "boolean").map(([field, key, label, icon]): Toggle => ({
      key, label, icon, on: auto[field] === true,
      ...(key === "page_view" && typeof auto.vtp_enableHistoryEvents === "boolean" ? { note: auto.vtp_enableHistoryEvents ? "History on" : "History off" } : {}),
    })),
  } : null;
  const crossDomain = one("__ogt_cross_domain");
  const referral = one("__ogt_referral_exclusion");
  const timeout = one("__ogt_session_timeout");
  const session = timeout ? {
    hours: asNumber(timeout.vtp_sessionHours) ?? 0,
    minutes: asNumber(timeout.vtp_sessionMinutes) ?? 0,
    ...(typeof timeout.vtp_engagementSeconds === "number" ? { engagementSeconds: timeout.vtp_engagementSeconds } : {}),
  } : null;
  const cookies: Ga4Report["cookies"] = [];
  for (const tag of scoped) {
    for (const [field, label] of [["vtp_cookieDomain", "Cookie domain"], ["vtp_cookieExpiration", "Cookie expiration (seconds)"], ["vtp_cookieUpdate", "Refresh cookie on each hit"], ["vtp_cookiePrefix", "Cookie prefix"], ["vtp_cookiePath", "Cookie path"], ["vtp_cookieFlags", "Cookie flags"]] as const) {
      if (tag[field] != null && typeof tag[field] !== "object") cookies.push({ key: field.slice(4), label, value: String(tag[field]) });
    }
  }
  const pii = one("__ogt_1p_data_v2");
  const userProvidedData = pii ? ([
    ["vtp_isEnabled", "Enabled"], ["vtp_isAutoEnabled", "Auto collection"], ["vtp_autoEmailEnabled", "Auto email"],
    ["vtp_autoPhoneEnabled", "Auto phone"], ["vtp_autoAddressEnabled", "Auto address"], ["vtp_isManualEnabled", "Manual enabled"],
    ["vtp_isAutoCollectPiiEnabledFlag", "PII auto-collect"],
  ] as const).filter(([field]) => typeof pii[field] === "boolean").map(([field, label]) => ({ key: field.slice(4), label, on: pii[field] === true })) : null;
  const cps = one("__ogt_cps");
  const dataUse = cps ? {
    mode: asString(cps.vtp_cpsMode) ?? "UNKNOWN",
    services: ([
      ["vtp_cpsAds", "Google Ads", "campaign"], ["vtp_cpsSearch", "Google Search", "search"], ["vtp_cpsShopping", "Google Shopping", "shopping_cart"],
      ["vtp_cpsYoutube", "YouTube", "smart_display"], ["vtp_cpsPlaystore", "Play Store", "play_circle"], ["vtp_cpsMaps", "Google Maps", "public"],
    ] as const).map(([field, label, icon]) => ({ key: field.slice(7).toLowerCase(), label, icon, on: cps[field] === true })),
  } : null;
  const extractModes: Record<string, string> = { JS_VAR: "JavaScript variable", CSS_SELECTOR: "CSS selector", DATA_LAYER: "Data layer", URL_QUERY: "URL query parameter" };
  const dataExtraction = byFn("__ogt_data_extract").flatMap((tag) => decodeList(tag.vtp_rules)).filter(isObject).map((rule) => ({
    parameter: String(rule.type ?? rule.parameter ?? ""),
    mode: extractModes[String(rule.mode)] ?? String(rule.mode ?? ""),
    location: String(rule.selector ?? rule.key ?? ""),
  }));
  const connected = new Map<string, string>();
  for (const tag of tags) {
    if (tag.function === "__zone") for (const child of decodeList(tag.vtp_childContainers)) {
      if (isObject(child) && typeof child.publicId === "string") connected.set(child.publicId.toUpperCase(), productFor(child.publicId.toUpperCase()));
    }
    if (["__dest_aw", "__dest_dc", "__dest_ga"].includes(String(tag.function))) {
      const id = asString(tag.vtp_destinationId)?.toUpperCase();
      if (id && id !== measurementId) connected.set(id, productFor(id));
    }
  }
  const dtc = one("__ogt_dtc");
  const dataTransmission = dtc ? {
    level: asString(dtc.vtp_level) ?? "unknown",
    restrictAds: dtc.vtp_restrictAdvertisingTransmission === true,
    preventAds: dtc.vtp_level === "noAdvertising" || dtc.vtp_preventAllConsent === true,
    preventAnalytics: dtc.vtp_preventAnalytics === true,
    preventDiagnostics: dtc.vtp_preventDiagnostics === true || dtc.vtp_preventAllConsent === true,
  } : null;
  const consent = one("__ogt_consent_defaults");
  const regionText = (mode: unknown, regions: unknown) => (mode === "ALL" || mode == null ? "All regions" : [asString(mode), asString(regions)].filter(Boolean).join(": "));
  const consentOverrides = consent ? {
    ads: { denied: consent.vtp_adsToggle === true, regions: regionText(consent.vtp_adsTargetingMode, consent.vtp_adsRegions) },
    analytics: { denied: consent.vtp_analyticsToggle === true, regions: regionText(consent.vtp_analyticsTargetingMode, consent.vtp_analyticsRegions) },
  } : null;
  const dma = one("__ogt_dma");

  // Data collection
  const signals = one("__ogt_google_signals");
  const regscope = decodeList(one("__ccd_ga_regscope")?.vtp_settingsTable).filter(isObject);
  const regionRow = (group: string) => {
    const row = regscope.find((item) => item.redactFieldGroup === group);
    if (!row) return null;
    const regions = String(row.disallowedRegions ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    return { disallowAll: row.disallowAllRegions === true, regions };
  };
  const geo = regionRow("DEVICE_AND_GEO");
  const add1p = byFn("__ccd_add_1p_data");

  // Tag signals
  const tagSignals: Ga4Report["tagSignals"] = [];
  if (one("__ccd_ga_ads_link")) tagSignals.push({ key: "ads_link", label: "Google Ads link", description: "Sends signals to a linked Google Ads destination.", icon: "campaign" });
  if (one("__ccd_ga_first")) tagSignals.push({ key: "first", label: "First-visit tracking", description: "Detects the first session for each user (first_visit / first_open).", icon: "sensors" });
  if (one("__ccd_ga_last")) tagSignals.push({ key: "last", label: "Session lifecycle tracking", description: "Tracks session start/end signals on every measurement hit.", icon: "timer" });

  return {
    kind: "ga4",
    requestedId: upper,
    measurementId,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    libraryVersion: resource.version,
    weightBytes: new TextEncoder().encode(source).length,
    otherDestinations: gaDestinations.filter((id) => id !== measurementId),
    enhancedMeasurement,
    createdEvents,
    modifiedEvents,
    keyEvents,
    redaction,
    uaEvents: gaSend ? gaSend.vtp_value === true : null,
    autoEventDetection,
    crossDomains: crossDomain ? stringList(crossDomain.vtp_rules) : null,
    internalTrafficRules: byFn("__ogt_ip_mark").map((tag, index) => ({ order: asNumber(tag.vtp_instanceOrder) ?? index, paramValue: asString(tag.vtp_paramValue) ?? "internal" })),
    unwantedReferrals: referral ? stringList(referral.vtp_includeConditions) : null,
    session,
    cookies,
    userProvidedData,
    dataUse,
    dataExtraction,
    connectedTags: [...connected].map(([id, product]) => ({ id, product })),
    dataTransmission,
    consentOverrides,
    dmaDefaults: dma ? { value: asString(dma.vtp_dmaDefault) ?? "UNKNOWN", delegationMode: asString(dma.vtp_delegationMode) ?? "OFF" } : null,
    googleSignals: asString(signals?.vtp_googleSignals) ?? null,
    granularLocation: geo ? { allowedEverywhere: !geo.disallowAll && geo.regions.length === 0, ...geo } : null,
    signalsRegions: regionRow("GOOGLE_SIGNALS"),
    userDataCollection: pii || add1p.length || one("__ccd_add_ecs") ? {
      autoDetected: pii?.vtp_isAutoEnabled === true,
      stitching: !!one("__ccd_add_ecs"),
      acceptsAutomatic: add1p.some((tag) => asBool(tag.vtp_acceptAutomatic) === true),
    } : null,
    tagSignals,
    unrecognized: [...new Set(tags.map((tag) => String(tag.function)).filter((fn) => !HANDLED.has(fn)))],
  };
}
