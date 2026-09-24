/** A Meta Pixel's public configuration, decoded from connect.facebook.net/signals/config/<pixel ID>. */
export interface MetaPixelReport {
  pixelId: string;
  fetchedAt: string;
  sourceUrl: string;
  weightBytes: number;
  /** Plugins the pixel loads, with plain-language meaning. */
  features: MetaFeature[];
  automaticMatching: { enabled: boolean; partnerIntegrations: boolean; keys: { key: string; label: string }[] };
  /** Event Setup Tool (codeless) rules that turn clicks and page loads into standard events. */
  codelessEvents: CodelessRule[];
  /** In-website labelling extractors: custom parameters read from the page. */
  parameterExtractors: unknown[];
  inferredEvents: { enabled: boolean; restrictedDataDisabled: boolean; buttonSelector: string | null };
  restrictions: {
    /** URL query keys and custom-data keys Meta strips, per event ("*" means every event). */
    blockedParams: { event: string; urlParams: string[]; customData: string[] }[];
    sensitiveKeys: string[];
    restrictedEvents: string[];
    unverifiedEvents: string[];
    prohibitedSources: string[];
  };
  identity: {
    firstPartyCookies: boolean;
    /** URL parameters the pixel turns into click IDs (fbclid, AEM brid, WhatsApp waaem…). */
    clickIdParams: { param: string; purpose: string }[];
    lastExternalReferrer: boolean;
  };
  conversionsApiGateway: boolean;
  aemBridge: boolean;
  /** Meta's server-side rollout flags for this pixel. */
  rolloutFlags: { name: string; label: string; on: boolean }[];
  score: MetaScore;
  /** Every config.set block, for the raw view and change tracking. */
  raw: Record<string, unknown>;
}

export interface MetaFeature { key: string; name: string; description: string; category: "Events" | "Matching" | "Privacy" | "Measurement" | "Integration" | "Other" }

export interface CodelessRule {
  id: string;
  event: string;
  active: boolean;
  match: "all" | "any" | "none";
  conditions: { trigger: string; target: string; field: string; operator: string; value: string }[];
  /** Plain-language sentence for the whole rule. */
  sentence: string;
}

export interface MetaScore {
  value: number;
  checks: { label: string; passed: boolean; points: number; hint: string }[];
}
