import type { CodelessRule, MetaFeature, MetaPixelReport, MetaScore } from "./types";

export class NoPixelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotPublishedError";
  }
}

/** Reads one JSON value starting at `start`, tracking strings and brackets (the config blocks are plain JSON). */
function readJson(source: string, start: number): unknown {
  let depth = 0;
  let inString = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (inString) {
      if (char === "\\") index++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") {
      depth--;
      if (depth === 0) return JSON.parse(source.slice(start, index + 1));
    }
  }
  throw new Error("Unterminated config block");
}

const FEATURES: Record<string, Omit<MetaFeature, "key">> = {
  AutomaticMatching: { name: "Automatic advanced matching", category: "Matching", description: "Reads email, phone and similar form fields on the page, hashes them in the browser and sends them with events so Meta can match visitors to accounts." },
  AutomaticMatchingForPartnerIntegrations: { name: "Partner advanced matching", category: "Matching", description: "Advanced matching for partner integrations such as Shopify or WooCommerce." },
  FirstPartyCookies: { name: "First-party cookies", category: "Matching", description: "Stores the _fbp browser ID and _fbc click ID in cookies on the site's own domain, so they survive third-party cookie blocking." },
  AutomaticParameters: { name: "Automatic parameters", category: "Events", description: "Adds page metadata (title, JSON-LD, OpenGraph and schema.org product data) to events automatically." },
  InferredEvents: { name: "Automatic events", category: "Events", description: "Sends button clicks and page metadata automatically as SubscribedButtonClick and Microdata events." },
  ESTRuleEngine: { name: "Codeless events", category: "Events", description: "Runs Event Setup Tool rules that turn clicks and page loads into standard events without code." },
  IWLBootstrapper: { name: "Event Setup Tool loader", category: "Events", description: "Loads Meta's point-and-click Event Setup Tool when someone opens the site from Events Manager." },
  IWLParameters: { name: "Codeless parameters", category: "Events", description: "Reads custom event parameters (value, content name…) from page elements chosen in the Event Setup Tool." },
  OpenBridge: { name: "Conversions API Gateway", category: "Integration", description: "Events are also sent server-side through the site's Conversions API Gateway, which is more resilient to ad blockers and browser limits." },
  BrowserProperties: { name: "Browser properties", category: "Measurement", description: "Reads the click ID from the landing URL and browser details used to attribute events." },
  ClientHint: { name: "Client hints", category: "Measurement", description: "Reads User-Agent Client Hints (device model, platform version) for better attribution." },
  IABPCMAEBridge: { name: "iOS measurement bridge", category: "Measurement", description: "Bridges to Aggregated Event Measurement and Private Click Measurement for iOS in-app browser traffic." },
  LastExternalReferrer: { name: "Last external referrer", category: "Measurement", description: "Remembers the last external referrer so events keep their traffic source." },
  CookieDeprecationLabel: { name: "Cookie deprecation label", category: "Privacy", description: "Reads Chrome's cookie-deprecation test label (Privacy Sandbox)." },
  EventValidation: { name: "Event validation", category: "Privacy", description: "Checks events against Meta's restricted and unverified event lists before sending." },
  ProhibitedSources: { name: "Prohibited sources", category: "Privacy", description: "Drops events that come from traffic sources Meta has blocked for this pixel." },
  UnwantedData: { name: "Blocked data", category: "Privacy", description: "Strips URL parameters and custom-data keys that are blocked for this pixel before events leave the browser." },
  UnwantedParams: { name: "Blocked parameters", category: "Privacy", description: "Removes event parameters that were blocked in Events Manager." },
  StandardParamChecks: { name: "Parameter checks", category: "Privacy", description: "Validates standard parameters (value, currency, content IDs) against Meta's formats." },
  Gating: { name: "Rollout flags", category: "Other", description: "Receives Meta's server-side feature flags for this pixel." },
};

export const MATCH_KEYS: Record<string, string> = {
  em: "Email", ph: "Phone", fn: "First name", ln: "Last name", ge: "Gender", db: "Date of birth",
  ct: "City", st: "State", zp: "ZIP / postal code", country: "Country", external_id: "External ID",
};

const CLICK_PARAMS: Record<string, string> = {
  fbclid: "Facebook and Instagram ad click ID, stored as the _fbc cookie",
  brid: "Aggregated Event Measurement click ID",
  waaem: "WhatsApp ad click ID",
};

// Event Setup Tool enums, as defined in Meta's rule engine (SignalsESTRuleEngine).
const EST_TRIGGER: Record<number, string> = { 1: "clicks", 2: "loads", 3: "sees", 4: "sends" };
const EST_TARGET: Record<number, string> = { 1: "a button", 2: "a page", 3: "a JavaScript variable", 4: "an event", 6: "an element" };
const EST_FIELD: Record<number, string> = { 1: "URL", 2: "text", 3: "text", 4: "text", 5: "CSS class", 6: "element ID", 7: "event name", 8: "link destination", 9: "domain", 10: "page title", 11: "image URL" };
const EST_OPERATOR: Record<number, string> = { 1: "contains", 2: "equals", 3: "is on domain", 4: "matches" };
const EST_MATCH: Record<number, CodelessRule["match"]> = { 1: "all", 2: "any", 3: "none" };

/** Rule values are sometimes UTF-8 bytes read as Latin-1 ("â\u0096¼" for "▼"); repair them when that is the case. */
function repairText(value: string): string {
  if (!/[\u0080-ÿ]/.test(value) || /[^\u0000-ÿ]/.test(value)) return value;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(value, (char) => char.charCodeAt(0)));
  } catch {
    return value;
  }
}

type RawRule = { condition?: { type?: number; conditions?: { targetType?: number; extractor?: number | null; operator?: number; action?: number; value?: string | null }[] }; derived_event_name?: string; rule_status?: string; rule_id?: string };

function decodeRule(rule: RawRule, index: number): CodelessRule {
  const match = EST_MATCH[rule.condition?.type ?? 1] ?? "all";
  const conditions = (rule.condition?.conditions ?? []).map((condition) => ({
    trigger: EST_TRIGGER[condition.action ?? 0] ?? "interacts with",
    target: EST_TARGET[condition.targetType ?? 0] ?? "an element",
    field: EST_FIELD[condition.extractor ?? 0] ?? "value",
    operator: EST_OPERATOR[condition.operator ?? 0] ?? "matches",
    value: repairText(condition.value ?? ""),
  }));
  const clause = (condition: CodelessRule["conditions"][number]) => `${condition.trigger} ${condition.target} whose ${condition.field} ${condition.operator} "${condition.value}"`;
  const joined = conditions.map(clause).join(match === "any" ? " or " : " and ");
  const event = rule.derived_event_name ?? "event";
  const sentence = conditions.length
    ? match === "none" ? `Unless a visitor ${joined}, send ${event}` : `When a visitor ${joined}, send ${event}`
    : `Send ${event}`;
  return { id: rule.rule_id ?? `rule-${index + 1}`, event, active: (rule.rule_status ?? "ACTIVE") === "ACTIVE", match, conditions, sentence };
}

const humanize = (name: string) => name.replace(/_/g, " ").replace(/\b(gtm|ga4|pii|pdl|xhr|clo|ob3|dpo|sbc|cbsdk|aem)\b/gi, (word) => word.toUpperCase()).replace(/^./, (char) => char.toUpperCase());

function scoreOf(report: Omit<MetaPixelReport, "score">): MetaScore {
  const checks: MetaScore["checks"] = [
    { label: "Automatic advanced matching", points: 25, passed: report.automaticMatching.enabled && report.automaticMatching.keys.length >= 3, hint: "Turn on automatic advanced matching in Events Manager so hashed emails and phone numbers are sent with events." },
    { label: "Conversions API Gateway", points: 20, passed: report.conversionsApiGateway, hint: "Send events server-side too (Conversions API or its Gateway). Browser-only pixels lose events to ad blockers and Safari limits." },
    { label: "First-party cookies", points: 10, passed: report.identity.firstPartyCookies, hint: "Keep first-party cookies on so _fbp and _fbc survive third-party cookie blocking." },
    { label: "Ad click IDs captured", points: 10, passed: report.identity.clickIdParams.some((item) => item.param === "fbclid"), hint: "The pixel should read fbclid from landing URLs to attribute ad clicks." },
    { label: "Automatic events and parameters", points: 10, passed: report.inferredEvents.enabled || report.features.some((feature) => feature.key === "AutomaticParameters"), hint: "Automatic events and parameters add clicks and product metadata without code." },
    { label: "Codeless events configured", points: 10, passed: report.codelessEvents.some((rule) => rule.active), hint: "No Event Setup Tool rules are published. Events sent in the site's own code are not visible here." },
    { label: "iOS measurement bridge", points: 5, passed: report.aemBridge, hint: "The Aggregated Event Measurement bridge helps attribute iOS in-app traffic." },
    { label: "Client hints", points: 5, passed: report.features.some((feature) => feature.key === "ClientHint"), hint: "Client hints improve device matching as User-Agent strings get less detailed." },
    { label: "No restricted events", points: 5, passed: !report.restrictions.restrictedEvents.length && !report.restrictions.unverifiedEvents.length, hint: "Meta restricts or has not verified some events for this pixel, so they may be dropped." },
  ];
  return { value: checks.reduce((sum, check) => sum + (check.passed ? check.points : 0), 0), checks };
}

export function parseMetaPixel(source: string, pixelId: string, sourceUrl: string): MetaPixelReport {
  const id = pixelId.trim();
  const config: Record<string, unknown> = {};
  const optIns = new Set<string>();
  const sets: Record<string, unknown> = {};

  for (const match of source.matchAll(/config\.set\((?:"(\d+)"|null),\s*"(\w+)",\s*/g)) {
    if (match[1] && match[1] !== id) continue;
    try { config[match[2]] = readJson(source, match.index! + match[0].length); } catch { /* not a data block */ }
  }
  for (const match of source.matchAll(/instance\.optIn\("(\d+)",\s*"(\w+)",\s*true\)/g)) if (match[1] === id) optIns.add(match[2]);
  for (const match of source.matchAll(/fbq\.set\("(\w+)",\s*"(\d+)",\s*/g)) {
    if (match[2] !== id) continue;
    try { sets[match[1]] = readJson(source, match.index! + match[0].length); } catch { /* not a data block */ }
  }
  if (!optIns.size && !Object.keys(config).some((key) => key !== "batching" && key !== "microdata")) {
    throw new NoPixelConfigError(`Meta has no public configuration for pixel ${id}. Check the ID; the pixel may be deleted or never used.`);
  }

  const get = <T,>(key: string) => (config[key] ?? {}) as T;
  const matching = get<{ selectedMatchKeys?: string[] }>("automaticMatching");
  const cookie = get<{ fbcParamsConfig?: { params?: { query: string }[] } }>("cookie");
  const unwanted = get<{ blacklisted_keys?: Record<string, { url?: string[]; cd?: string[] }>; sensitive_keys?: Record<string, unknown> }>("unwantedData");
  const validation = get<{ unverifiedEventNames?: string[]; restrictedEventNames?: string[] }>("eventValidation");
  const prohibited = get<{ prohibitedSources?: unknown[] }>("prohibitedSources");
  const inferred = get<{ disableRestrictedData?: boolean; buttonSelector?: string | null }>("inferredEvents");
  const gating = get<{ gatings?: { name: string; passed: boolean }[] }>("gating");

  const report: Omit<MetaPixelReport, "score"> = {
    pixelId: id,
    fetchedAt: new Date().toISOString(),
    sourceUrl,
    weightBytes: new TextEncoder().encode(source).length,
    features: [...optIns].map((key) => ({ key, ...(FEATURES[key] ?? { name: humanize(key.replace(/([a-z])([A-Z])/g, "$1_$2")), category: "Other" as const, description: "A pixel plugin Meta loads for this pixel." }) })),
    automaticMatching: {
      enabled: optIns.has("AutomaticMatching"),
      partnerIntegrations: optIns.has("AutomaticMatchingForPartnerIntegrations"),
      keys: (matching.selectedMatchKeys ?? []).map((key) => ({ key, label: MATCH_KEYS[key] ?? key })),
    },
    codelessEvents: Array.isArray(sets.estRules) ? (sets.estRules as RawRule[]).map(decodeRule) : [],
    parameterExtractors: Array.isArray(sets.iwlExtractors) ? sets.iwlExtractors : [],
    inferredEvents: { enabled: optIns.has("InferredEvents"), restrictedDataDisabled: !!inferred.disableRestrictedData, buttonSelector: inferred.buttonSelector ?? null },
    restrictions: {
      blockedParams: Object.entries(unwanted.blacklisted_keys ?? {}).map(([event, keys]) => ({ event, urlParams: keys.url ?? [], customData: keys.cd ?? [] })).filter((item) => item.urlParams.length || item.customData.length),
      sensitiveKeys: Object.keys(unwanted.sensitive_keys ?? {}),
      restrictedEvents: validation.restrictedEventNames ?? [],
      unverifiedEvents: validation.unverifiedEventNames ?? [],
      prohibitedSources: (prohibited.prohibitedSources ?? []).map(String),
    },
    identity: {
      firstPartyCookies: optIns.has("FirstPartyCookies"),
      clickIdParams: (cookie.fbcParamsConfig?.params ?? []).map((item) => ({ param: item.query, purpose: CLICK_PARAMS[item.query] ?? "Click ID read from landing URLs" })),
      lastExternalReferrer: optIns.has("LastExternalReferrer"),
    },
    conversionsApiGateway: optIns.has("OpenBridge"),
    aemBridge: optIns.has("IABPCMAEBridge"),
    rolloutFlags: (gating.gatings ?? []).map((flag) => ({ name: flag.name, label: humanize(flag.name), on: !!flag.passed })),
    raw: { ...config, ...sets, optIns: [...optIns].sort() },
  };
  return { ...report, score: scoreOf(report) };
}
