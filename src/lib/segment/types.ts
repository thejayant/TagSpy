/** A Segment source's public settings, decoded from cdn.segment.com/v1/projects/<write key>/settings. */
export interface SegmentReport {
  writeKey: string;
  fetchedAt: string;
  sourceUrl: string;
  weightBytes: number;
  /** When the source's settings were last published in Segment. */
  lastModified: string | null;
  library: {
    analyticsNext: boolean;
    version: string | null;
    /** Where events are sent; a non-default host means a first-party proxy or a regional endpoint. */
    apiHost: string;
    region: "US" | "EU" | "Custom";
    firstPartyProxy: boolean;
    metricsSampleRate: number | null;
    autoInstrumentation: boolean;
  };
  destinations: SegmentDestination[];
  trackingPlan: {
    enforced: boolean;
    events: { name: string; enabled: boolean; overrides: { destination: string; enabled: boolean }[] }[];
    traits: { name: string; enabled: boolean }[];
    traitsEnforced: boolean;
    groupTraits: { name: string; enabled: boolean }[];
  };
  consent: {
    categories: string[];
    hasUnmappedDestinations: boolean;
    /** Destinations with no consent category: they get data whatever the visitor chose. */
    unmapped: string[];
  };
  rules: SegmentRule[];
  middleware: { edgeFunction: boolean; sourceMiddleware: string[] };
  insights: SegmentInsight[];
  score: { value: number; checks: { label: string; passed: boolean; points: number; hint: string }[] };
  raw: Record<string, unknown>;
}

export type SegmentCategory = "Advertising" | "Analytics" | "Marketing & CRM" | "Personalization" | "Sales intelligence" | "Support" | "Data & warehouses" | "Segment" | "Other";

export interface SegmentDestination {
  name: string;
  /** Canonical vendor name used for its logo and links. */
  vendor: string;
  category: SegmentCategory;
  /** device: the vendor's script loads in the browser; cloud: Segment forwards server-side; actions: Segment Actions destination. */
  mode: "device" | "cloud" | "actions";
  version: string | null;
  consentCategories: string[];
  /** IDs worth showing and linking (GA4 measurement IDs, pixel IDs, tag IDs…). */
  ids: { label: string; value: string; link?: string }[];
  settings: Record<string, unknown>;
  /** Actions destinations: which events trigger which action. */
  subscriptions: { name: string; action: string; trigger: string; enabled: boolean }[];
}

export interface SegmentRule {
  destination: string;
  kind: "consent" | "filter" | "transform";
  action: string;
  /** Plain-language sentence. */
  sentence: string;
  expression: string;
}

export interface SegmentInsight { tone: "good" | "warn" | "info"; icon: string; text: string }
