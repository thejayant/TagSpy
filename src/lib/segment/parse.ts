import type { SegmentCategory, SegmentDestination, SegmentInsight, SegmentReport, SegmentRule } from "./types";

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const DEFAULT_HOST = "api.segment.io/v1";

/** Destination name → canonical vendor (matching TagSpy's logo names) and category. First match wins. */
const VENDORS: Array<[RegExp, string, SegmentCategory]> = [
  [/google analytics|\bga4\b|universal analytics/i, "Google Analytics", "Analytics"],
  [/google tag manager/i, "Google Tag Manager", "Analytics"],
  [/google ads|adwords|google enhanced conversions/i, "Google Ads", "Advertising"],
  [/doubleclick|campaign manager|floodlight|display & video/i, "Floodlight", "Advertising"],
  [/facebook|meta pixel|meta conversions|instagram/i, "Meta Pixel", "Advertising"],
  [/bing|microsoft advertising|microsoft ads/i, "Microsoft Advertising", "Advertising"],
  [/clarity/i, "Microsoft Clarity", "Analytics"],
  [/linkedin/i, "LinkedIn", "Advertising"],
  [/tiktok/i, "TikTok Pixel", "Advertising"],
  [/twitter|\bx ads\b/i, "X / Twitter", "Advertising"],
  [/pinterest/i, "Pinterest", "Advertising"],
  [/reddit/i, "Reddit Pixel", "Advertising"],
  [/snap/i, "Snap Pixel", "Advertising"],
  [/quora/i, "Quora", "Advertising"],
  [/criteo/i, "Criteo", "Advertising"],
  [/adroll/i, "AdRoll", "Advertising"],
  [/taboola/i, "Taboola", "Advertising"],
  [/outbrain/i, "Outbrain", "Advertising"],
  [/stackadapt|trade desk|stack adapt/i, "StackAdapt", "Advertising"],
  [/amplitude/i, "Amplitude", "Analytics"],
  [/mixpanel/i, "Mixpanel", "Analytics"],
  [/heap/i, "Heap", "Analytics"],
  [/hotjar/i, "Hotjar", "Analytics"],
  [/posthog/i, "PostHog", "Analytics"],
  [/matomo|piwik/i, "Matomo", "Analytics"],
  [/fullstory|pendo|kissmetrics|adobe analytics|snowplow|plausible|logrocket|smartlook|mouseflow/i, "", "Analytics"],
  [/hubspot/i, "HubSpot", "Marketing & CRM"],
  [/salesforce|pardot/i, "Salesforce Pardot", "Marketing & CRM"],
  [/mailchimp/i, "Mailchimp", "Marketing & CRM"],
  [/klaviyo/i, "Klaviyo", "Marketing & CRM"],
  [/intercom/i, "Intercom", "Support"],
  [/zendesk/i, "Zendesk", "Support"],
  [/freshdesk|help ?scout|gorgias|front\b/i, "", "Support"],
  [/marketo|braze|customer\.?io|iterable|eloqua|activecampaign|vero|autopilot|drift|sendgrid|attentive|onesignal|airship/i, "", "Marketing & CRM"],
  [/optimizely/i, "Optimizely", "Personalization"],
  [/vwo|visual website/i, "VWO", "Personalization"],
  [/mutiny|launchdarkly|dynamic yield|appcues|userpilot|chameleon|split\b|statsig|intellimize/i, "", "Personalization"],
  [/koala|clearbit|6sense|demandbase|zoominfo|madkudu|qualified|leadfeeder|warmly|rb2b/i, "", "Sales intelligence"],
  [/bigquery|snowflake|redshift|s3\b|amazon|kinesis|databricks|postgres|azure|google cloud|pub\/sub|webhook|kafka|eventbridge|lambda|functions?\b/i, "", "Data & warehouses"],
  [/segment/i, "Segment", "Segment"],
];

export function classifyDestination(name: string): { vendor: string; category: SegmentCategory } {
  const clean = name.replace(/\s*\((actions|cloud|web|browser|mobile)\)\s*/gi, " ").trim();
  for (const [pattern, vendor, category] of VENDORS) if (pattern.test(clean)) return { vendor: vendor || clean, category };
  return { vendor: clean, category: "Other" };
}

const ID_KEY = /^(measurement_?id|tracking_?id|tag_?id|uet_?tag_?id|pixel_?id|container_?id|conversion_?id|advertiser_?id|partner_?id|site_?id|app_?id|account_?id|project_?id|portal_?id|hub_?id|api_?key|token|client_?id|write_?key|workspace_?id|property_?id)$/i;

function idsFrom(settings: Json, vendor: string): SegmentDestination["ids"] {
  const output: SegmentDestination["ids"] = [];
  const visit = (value: unknown, key: string) => {
    if (typeof value !== "string" && typeof value !== "number") return;
    const text = String(value).trim();
    if (!text || text.length > 80 || !ID_KEY.test(key)) return;
    const label = /key|token/i.test(key) ? "Public client key" : key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase()).replace(/\bid\b/i, "ID");
    const link = /^G-[A-Z0-9]{4,}$/.test(text) ? `/ga4?id=${text}` : /^GTM-[A-Z0-9]{4,}$/.test(text) ? `/gtm?id=${text}` : vendor === "Meta Pixel" && /^\d{10,20}$/.test(text) ? `/meta?id=${text}` : undefined;
    output.push({ label, value: text, ...(link ? { link } : {}) });
  };
  for (const [key, value] of Object.entries(settings)) {
    if (Array.isArray(value)) value.forEach((item) => visit(item, key));
    else visit(value, key);
  }
  return output;
}

/* ── Segment filter rules (FQL) → plain language ──────────────────────── */

type Ir = unknown[];

function field(path: string): string {
  const consent = /^context\.consent\.categoryPreferences\.(.+)$/.exec(path);
  if (consent) return `consent for “${consent[1]}”`;
  const named: Record<string, string> = {
    event: "the event name", type: "the call type", userId: "the user ID", anonymousId: "the anonymous ID", name: "the page name",
    "context.page.url": "the page URL", "context.page.path": "the page path", "context.page.brand": "the page brand", "context.page.referrer": "the referrer",
    "context.page.title": "the page title", "context.consent.categoryPreferences": "the consent preferences", "context.userAgent": "the user agent",
  };
  if (named[path]) return named[path];
  const prop = /^properties\.(.+)$/.exec(path);
  if (prop) return `property “${prop[1]}”`;
  const trait = /^(?:context\.)?traits\.(.+)$/.exec(path);
  if (trait) return `trait “${trait[1]}”`;
  return `“${path}”`;
}

export function describeFql(ir: unknown): string {
  if (!Array.isArray(ir) || !ir.length) return String(ir);
  const [op, ...args] = ir as Ir;
  const nested = (item: unknown) => (Array.isArray(item) && (item[0] === "or" || item[0] === "and") ? `(${describeFql(item)})` : describeFql(item));
  if (op === "and") return args.map(nested).join(" and ");
  if (op === "or") return args.map(nested).join(" or ");
  if (op === "!") return `not ${nested(args[0])}`;
  const [path, operand] = args as [string, { value?: unknown } | undefined];
  const value = isObject(operand) ? operand.value : operand;
  const quoted = typeof value === "string" ? `“${value}”` : String(value);
  switch (op) {
    case "=": return value === null ? `${field(path)} is not set` : value === false ? `${field(path)} is off` : value === true ? `${field(path)} is on` : `${field(path)} is ${quoted}`;
    case "!=": return value === null ? `${field(path)} is set` : `${field(path)} is not ${quoted}`;
    case "contains": return `${field(path)} contains ${quoted}`;
    case "match": return `${field(path)} matches ${quoted}`;
    case ">": case "<": case ">=": case "<=": return `${field(path)} ${op} ${quoted}`;
    default: return JSON.stringify(ir);
  }
}

function describeRule(rule: Json): SegmentRule {
  const destination = String(rule.destinationName ?? "All destinations");
  const matcher = (Array.isArray(rule.matchers) ? rule.matchers[0] : undefined) as Json | undefined;
  const expression = String((matcher?.config as Json | undefined)?.expr ?? "");
  let ir: unknown = null;
  try { ir = matcher?.ir ? JSON.parse(String(matcher.ir)) : null; } catch { /* keep the raw expression */ }
  const transformers = (Array.isArray(rule.transformers) ? rule.transformers.flat() : []) as Json[];
  const first = transformers[0] ?? {};
  const type = String(first.type ?? "drop");
  const meta = (first.metadata ?? {}) as Json;
  const condition = ir ? describeFql(ir) : expression || "always";

  if (meta.productArea === "consent" || /consent/i.test(String(meta.transformerName ?? ""))) {
    const category = /(\S+)\s+consent/i.exec(String(meta.transformerName ?? ""))?.[1] ?? expression.match(/categoryPreferences\.([\w-]+)/)?.[1] ?? "?";
    return { destination, kind: "consent", action: "Consent gate", expression, sentence: `Only receives events after the visitor grants consent category “${category}”. Visitors with no consent data at all are not filtered.` };
  }
  if (type === "drop") {
    const negated = Array.isArray(ir) && ir[0] === "!";
    return {
      destination, kind: "filter", action: negated ? "Allow only" : "Drop",
      expression, sentence: negated ? `Only receives events where ${describeFql((ir as Ir)[1])}.` : `Drops events where ${condition}.`,
    };
  }
  const config = (first.config ?? {}) as Json;
  const detail = type === "sample" ? `samples ${(config.sample as Json | undefined)?.percent ?? "some"}% of events` : type === "drop_properties" ? "removes properties" : type === "allow_properties" ? "keeps only listed properties" : type.replace(/_/g, " ");
  return { destination, kind: "transform", action: detail, expression, sentence: `When ${condition}, Segment ${detail}.` };
}

/* ── Main parser ───────────────────────────────────────────────────────── */

export class NoSegmentSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotPublishedError";
  }
}

const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);

export function parseSegmentSettings(source: string, writeKey: string, sourceUrl: string): SegmentReport {
  let json: Json;
  try { json = JSON.parse(source); } catch { throw new NoSegmentSourceError(`Segment has no public settings for write key ${writeKey}.`); }
  if (!isObject(json) || !isObject(json.integrations)) throw new NoSegmentSourceError(`Segment has no public settings for write key ${writeKey}.`);

  const integrations = json.integrations as Record<string, Json>;
  const segmentIo = (integrations["Segment.io"] ?? {}) as Json;
  const apiHost = String(segmentIo.apiHost ?? DEFAULT_HOST);
  const remotePlugins = (Array.isArray(json.remotePlugins) ? json.remotePlugins : []) as Json[];
  const consentSettings = (json.consentSettings ?? {}) as Json;

  const destinations: SegmentDestination[] = [];
  const add = (name: string, settings: Json, mode: SegmentDestination["mode"], subscriptions: SegmentDestination["subscriptions"] = []) => {
    const { vendor, category } = classifyDestination(name);
    const versionSettings = (settings.versionSettings ?? {}) as Json;
    const consent = ((settings.consentSettings as Json | undefined)?.categories ?? []) as string[];
    const clean = Object.fromEntries(Object.entries(settings).filter(([key]) => !["versionSettings", "consentSettings", "bundlingStatus", "type", "subscriptions"].includes(key)));
    destinations.push({ name, vendor, category, mode, version: (versionSettings.version as string | undefined) ?? null, consentCategories: consent, ids: idsFrom(clean, vendor), settings: clean, subscriptions });
  };

  for (const plugin of remotePlugins) {
    const name = String(plugin.creationName ?? plugin.name ?? "Actions destination");
    const settings = (plugin.settings ?? {}) as Json;
    const subscriptions = (Array.isArray(settings.subscriptions) ? settings.subscriptions : []) as Json[];
    add(name, { ...(integrations[name] ?? {}), ...settings }, "actions", subscriptions.map((item) => ({
      name: String(item.name ?? item.partnerAction ?? "Action"), action: String(item.partnerAction ?? item.name ?? ""), trigger: String(item.subscribe ?? ""), enabled: item.enabled !== false,
    })));
  }
  for (const [name, settings] of Object.entries(integrations)) {
    if (name === "Segment.io" || destinations.some((item) => item.name === name)) continue;
    const componentTypes = ((settings.versionSettings as Json | undefined)?.componentTypes ?? []) as string[];
    add(name, settings, componentTypes.includes("browser") || settings.type === "browser" ? "device" : "cloud");
  }
  for (const name of (segmentIo.unbundledIntegrations ?? []) as string[]) {
    if (!destinations.some((item) => item.name === name)) add(name, {}, "cloud");
  }
  destinations.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const plan = (json.plan ?? {}) as Record<string, Record<string, Json>>;
  const planEntries = (section: Record<string, Json> | undefined) => Object.entries(section ?? {}).filter(([name]) => name !== "__default");
  const trackingPlan: SegmentReport["trackingPlan"] = {
    enforced: plan.track?.__default?.enabled === false,
    events: planEntries(plan.track).map(([name, entry]) => ({
      name, enabled: entry.enabled !== false,
      overrides: Object.entries((entry.integrations ?? {}) as Record<string, unknown>).map(([destination, enabled]) => ({ destination, enabled: enabled !== false })),
    })),
    traits: planEntries(plan.identify).map(([name, entry]) => ({ name, enabled: entry.enabled !== false })),
    traitsEnforced: plan.identify?.__default?.enabled === false,
    groupTraits: planEntries(plan.group).map(([name, entry]) => ({ name, enabled: entry.enabled !== false })),
  };

  const rules = (((json.middlewareSettings as Json | undefined)?.routingRules ?? []) as Json[]).map(describeRule);
  const withConsent = new Set(rules.filter((rule) => rule.kind === "consent").map((rule) => rule.destination));
  const consent = {
    categories: ((consentSettings.allCategories ?? []) as string[]),
    hasUnmappedDestinations: consentSettings.hasUnmappedDestinations === true,
    unmapped: destinations.filter((item) => item.category !== "Segment" && !item.consentCategories.length && !withConsent.has(item.name)).map((item) => item.name),
  };
  const edgeFunction = isObject(json.edgeFunction) && Object.keys(json.edgeFunction).length > 0;
  const sourceMiddleware = Object.keys(isObject(json.enabledMiddleware) ? json.enabledMiddleware : {});
  const lastModified = typeof json._lastModified === "string" ? json._lastModified : null;
  const region: SegmentReport["library"]["region"] = /eu1|\.eu\./i.test(apiHost) ? "EU" : apiHost === DEFAULT_HOST ? "US" : "Custom";
  const metrics = (json.metrics ?? {}) as Json;
  const library: SegmentReport["library"] = {
    analyticsNext: json.analyticsNextEnabled === true,
    version: ((segmentIo.versionSettings as Json | undefined)?.version as string | undefined) ?? null,
    apiHost, region,
    firstPartyProxy: region === "Custom",
    metricsSampleRate: typeof metrics.sampleRate === "number" ? metrics.sampleRate : null,
    autoInstrumentation: isObject(json.autoInstrumentationSettings) && json.autoInstrumentationSettings.disableTraffic === false,
  };

  const devices = destinations.filter((item) => item.mode === "device");
  const tools = destinations.filter((item) => item.category !== "Segment");
  const age = daysSince(lastModified);
  const checks = [
    { label: "Tracking plan enforced", points: 20, passed: trackingPlan.enforced, hint: "Unplanned events are accepted. Block unplanned events in Protocols so only agreed event names reach destinations." },
    { label: "Every tool has a consent category", points: 20, passed: tools.length > 0 && !consent.unmapped.length && !consent.hasUnmappedDestinations, hint: "Some destinations have no consent category, so they receive data whatever the visitor chose." },
    { label: "Consent routing active", points: 15, passed: withConsent.size > 0, hint: "No consent rules drop events for visitors who declined a category." },
    { label: "Few browser-side destinations", points: 15, passed: devices.length <= 3, hint: "Many destinations load their own scripts in the browser. Cloud mode is lighter and harder to block." },
    { label: "First-party or regional endpoint", points: 10, passed: region !== "US", hint: "Events go to api.segment.io. A first-party proxy survives ad blockers; an EU endpoint keeps data in the EU." },
    { label: "Analytics.js 2.0", points: 10, passed: library.analyticsNext, hint: "The source still runs the classic Analytics.js library." },
    { label: "Maintained in the last year", points: 10, passed: age !== null && age <= 365, hint: "The settings have not been published for over a year." },
  ];

  const byCategory = new Map<string, number>();
  for (const item of tools) byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1);
  const insights: SegmentInsight[] = [];
  if (tools.length) insights.push({ tone: "info", icon: "hub", text: `Data flows to ${tools.length} tool${tools.length === 1 ? "" : "s"}: ${[...byCategory].map(([category, count]) => `${count} ${category.replace(/^[A-Z](?=[a-z])/, (char) => char.toLowerCase())}`).join(", ")}.` });
  insights.push(trackingPlan.enforced
    ? { tone: "good", icon: "verified", text: `Unplanned events are blocked. Only ${trackingPlan.events.filter((event) => event.enabled).length} planned events reach destinations.` }
    : { tone: "warn", icon: "rule", text: "Any event name is accepted: there is no tracking plan enforcement for track calls." });
  if (consent.unmapped.length) insights.push({ tone: "warn", icon: "gpp_maybe", text: `${consent.unmapped.join(", ")} ${consent.unmapped.length === 1 ? "has" : "have"} no consent category and receive data whatever the visitor chose.` });
  else if (withConsent.size) insights.push({ tone: "good", icon: "shield", text: `Every destination is gated by consent (${consent.categories.length} categor${consent.categories.length === 1 ? "y" : "ies"}).` });
  if (region === "EU") insights.push({ tone: "good", icon: "public", text: `Events go to Segment's EU endpoint (${apiHost}).` });
  if (region === "Custom") insights.push({ tone: "good", icon: "dns", text: `Events go to a custom endpoint (${apiHost}), a first-party proxy that ad blockers rarely catch.` });
  if (devices.length) insights.push({ tone: devices.length > 3 ? "warn" : "info", icon: "web", text: `${devices.length} destination${devices.length === 1 ? " loads its" : "s load their"} own script in the browser: ${devices.map((item) => item.name).join(", ")}.` });
  const serverOnly = (segmentIo.unbundledIntegrations ?? []) as string[];
  if (serverOnly.length) insights.push({ tone: "info", icon: "cloud", text: `${serverOnly.join(", ")} ${serverOnly.length === 1 ? "is" : "are"} sent server-side only (unbundled from the browser).` });
  const filters = rules.filter((rule) => rule.kind !== "consent");
  if (filters.length) insights.push({ tone: "info", icon: "filter_alt", text: `${filters.length} destination filter${filters.length === 1 ? "" : "s"} limit${filters.length === 1 ? "s" : ""} what ${[...new Set(filters.map((rule) => rule.destination))].join(", ")} receive${filters.length === 1 ? "s" : ""}.` });
  if (edgeFunction) insights.push({ tone: "info", icon: "functions", text: "A Segment edge function transforms events in the browser before they are sent." });
  if (sourceMiddleware.length) insights.push({ tone: "info", icon: "tune", text: `Source middleware: ${sourceMiddleware.join(", ")}.` });
  if (age !== null) insights.push({ tone: age > 365 ? "warn" : "info", icon: "schedule", text: `Settings last published on ${lastModified!.slice(0, 10)}.` });

  return {
    writeKey, fetchedAt: new Date().toISOString(), sourceUrl, weightBytes: new TextEncoder().encode(source).length,
    lastModified, library, destinations, trackingPlan, consent, rules,
    middleware: { edgeFunction, sourceMiddleware },
    insights,
    score: { value: checks.reduce((sum, check) => sum + (check.passed ? check.points : 0), 0), checks },
    raw: json,
  };
}
