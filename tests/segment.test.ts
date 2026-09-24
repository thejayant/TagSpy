import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { findSegmentKeys, idKind } from "@/lib/ids";
import { describeFql, parseSegmentSettings } from "@/lib/segment/parse";

const KEY = "NBBzVMlQO9GFFqU6upGyk4gqf6zV28TH";
const url = (key: string) => `https://cdn.segment.com/v1/projects/${key}/settings`;

describe("Segment settings", () => {
  const report = parseSegmentSettings(fs.readFileSync(`tests/fixtures/segment-${KEY}.json`, "utf8"), KEY, url(KEY));

  it("maps destinations to vendors, categories and modes, including server-only ones", () => {
    const bing = report.destinations.find((item) => item.name === "Bing Ads")!;
    expect(bing).toMatchObject({ vendor: "Microsoft Advertising", category: "Advertising", mode: "device", version: "2.0.3", consentCategories: ["ta-3"] });
    expect(bing.ids).toEqual([{ label: "Tag ID", value: "5202129" }]);
    expect(report.destinations.find((item) => item.name === "Mutiny")).toMatchObject({ category: "Personalization", mode: "cloud" });
    expect(report.destinations.find((item) => item.name === "Koala (Cloud)")?.category).toBe("Sales intelligence");
    expect(report.destinations.find((item) => item.name === "Marketo V2")).toMatchObject({ mode: "cloud", category: "Marketing & CRM" });
    expect(report.destinations.some((item) => item.name === "Segment.io")).toBe(false);
  });

  it("reads the tracking plan, consent, library and last publish date", () => {
    expect(report.trackingPlan.enforced).toBe(true);
    expect(report.trackingPlan.events.map((event) => event.name)).toContain("Form Submitted");
    expect(report.trackingPlan.traits.map((trait) => trait.name)).toContain("email");
    expect(report.consent.categories).toEqual(["ta-2", "ta-3"]);
    expect(report.consent.unmapped).toContain("Webhook");
    expect(report.library).toMatchObject({ analyticsNext: true, version: "4.4.7", apiHost: "api.segment.io/v1", region: "US" });
    expect(report.lastModified).toBe("2026-09-15T20:39:45.955Z");
  });

  it("translates consent gates and destination filters into sentences", () => {
    const consent = report.rules.find((rule) => rule.destination === "Bing Ads")!;
    expect(consent.kind).toBe("consent");
    expect(consent.sentence).toMatch(/consent category “ta-3”/);
    const filter = report.rules.find((rule) => rule.destination === "Koala" && rule.kind === "filter")!;
    expect(filter.sentence).toBe("Only receives events where the page brand is “segment”.");
    expect(describeFql(["and", ["!=", "event", { value: null }], ["or", ["contains", "context.page.url", { value: "/pricing" }], ["=", "properties.plan", { value: "pro" }]]]))
      .toBe("the event name is set and (the page URL contains “/pricing” or property “plan” is “pro”)");
  });

  it("scores governance and writes insights", () => {
    expect(report.score.value).toBeGreaterThan(0);
    expect(report.score.value).toBeLessThanOrEqual(100);
    expect(report.insights.some((insight) => /Unplanned events are blocked/.test(insight.text))).toBe(true);
    expect(report.insights.some((insight) => /Marketo V2/.test(insight.text))).toBe(true);
  });

  it("handles Actions destinations, EU endpoints and linkable IDs", () => {
    const synthetic = JSON.stringify({
      integrations: { "Segment.io": { apiKey: "abc", apiHost: "events.eu1.segmentapis.com/v1", versionSettings: { version: "4.4.7" } }, "Facebook Pixel": { pixelId: "1882987898627194", versionSettings: { componentTypes: ["browser"] } } },
      remotePlugins: [{ name: "Google Analytics 4 Web", creationName: "Google Analytics 4 Web", settings: { measurementID: "G-ABC1234567", subscriptions: [{ name: "Purchase", partnerAction: "purchase", subscribe: "event = \"Order Completed\"", enabled: true }] } }],
      plan: { track: { __default: { enabled: true } } },
    });
    const eu = parseSegmentSettings(synthetic, "abcdefghijklmnopqrstuvwxyz123456", url("x"));
    expect(eu.library.region).toBe("EU");
    const ga4 = eu.destinations.find((item) => item.mode === "actions")!;
    expect(ga4).toMatchObject({ vendor: "Google Analytics", subscriptions: [{ name: "Purchase", action: "purchase", trigger: "event = \"Order Completed\"", enabled: true }] });
    expect(ga4.ids).toContainEqual({ label: "Measurement ID", value: "G-ABC1234567", link: "/ga4?id=G-ABC1234567" });
    expect(eu.destinations.find((item) => item.vendor === "Meta Pixel")?.ids[0].link).toBe("/meta?id=1882987898627194");
    expect(eu.trackingPlan.enforced).toBe(false);
  });

  it("rejects responses that are not Segment settings", () => {
    expect(() => parseSegmentSettings("Cannot GET - Invalid path or write key provided.", "x".repeat(32), url("x"))).toThrow(/no public settings/);
  });

  it("finds write keys in snippets, loader calls and variables", () => {
    expect(findSegmentKeys(`var segmentKey = "${KEY}"; analytics.load(segmentKey, cookieConfig);`)).toEqual([KEY]);
    expect(findSegmentKeys(`<script src="https://cdn.segment.com/analytics.js/v1/Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56/analytics.min.js">`)).toEqual(["Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56"]);
    expect(findSegmentKeys(`AnalyticsBrowser.load({ writeKey: 'Zz99Yy88Xx77Ww66Vv55Uu44Tt33Ss22' })`)).toEqual(["Zz99Yy88Xx77Ww66Vv55Uu44Tt33Ss22"]);
    expect(idKind(KEY)).toBe("SEGMENT");
    expect(idKind("1882987898627194")).toBe("META");
  });
});
