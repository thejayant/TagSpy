export interface Toggle {
  key: string;
  label: string;
  icon: string;
  on: boolean;
  note?: string;
}

export interface EventCondition {
  parameter: string;
  operator: string;
  /** Raw compiled operator code, e.g. `eq`, `cni`, `rei`. */
  code: string;
  ignoreCase: boolean;
  value: string;
  negate: boolean;
}

export interface ParamOperation {
  action: "SET" | "COPY" | "REMOVE";
  parameter: string;
  value: string;
}

export interface EventRule {
  order: number;
  /** Created event name, or the renamed event name for modify rules. */
  name: string;
  copyParams: boolean;
  sourceEvent?: string;
  conditions: EventCondition[];
  operations: ParamOperation[];
}

export interface Ga4Report {
  kind: "ga4";
  requestedId: string;
  measurementId: string;
  sourceUrl: string;
  fetchedAt: string;
  libraryVersion?: string;
  weightBytes: number;
  /** Other measurement IDs available in the same response (for GT- tags with several destinations). */
  otherDestinations: string[];

  enhancedMeasurement: { enabled: boolean; items: Toggle[]; siteSearch?: { queryParams: string[]; additionalParams: string[] } } | null;
  createdEvents: EventRule[];
  modifiedEvents: EventRule[];
  keyEvents: string[];
  redaction: { email: boolean; queryParams: string[] } | null;
  uaEvents: boolean | null;

  autoEventDetection: { items: Toggle[] } | null;
  crossDomains: string[] | null;
  internalTrafficRules: { order: number; paramValue: string }[];
  unwantedReferrals: string[] | null;
  session: { hours: number; minutes: number; engagementSeconds?: number } | null;
  cookies: { key: string; label: string; value: string }[];
  userProvidedData: { key: string; label: string; on: boolean }[] | null;
  dataUse: { mode: string; services: { key: string; label: string; icon: string; on: boolean }[] } | null;
  dataExtraction: { parameter: string; mode: string; location: string }[];
  connectedTags: { id: string; product: string }[];
  dataTransmission: { level: string; restrictAds: boolean; preventAds: boolean; preventAnalytics: boolean; preventDiagnostics: boolean } | null;
  consentOverrides: { ads: { denied: boolean; regions: string }; analytics: { denied: boolean; regions: string } } | null;
  dmaDefaults: { value: string; delegationMode: string } | null;

  googleSignals: string | null;
  granularLocation: { allowedEverywhere: boolean; disallowAll: boolean; regions: string[] } | null;
  signalsRegions: { disallowAll: boolean; regions: string[] } | null;
  userDataCollection: { autoDetected: boolean; stitching: boolean; acceptsAutomatic: boolean } | null;

  tagSignals: { key: string; label: string; description: string; icon: string }[];
  /** Compiled functions present in the response that this parser has no dedicated view for. */
  unrecognized: string[];
}
