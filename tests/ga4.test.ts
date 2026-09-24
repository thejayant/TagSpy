import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGa4 } from "@/lib/ga4/parse";

// Real public gtag.js responses captured on 2026-09-24 (see tests/fixtures).
const fixture = (id: string) => fs.readFileSync(`tests/fixtures/gtag-${id}.js`, "utf8");

describe("parseGa4 — G-6SET8QZ3TV (demo property)", () => {
  const report = parseGa4(fixture("G-6SET8QZ3TV"), "G-6SET8QZ3TV", "https://www.googletagmanager.com/gtag/js?id=G-6SET8QZ3TV");

  it("reads the headline metrics", () => {
    expect(report.libraryVersion).toBe("11");
    expect(report.keyEvents).toEqual(["app_store_subscription_convert", "app_store_subscription_renew", "first_open", "in_app_purchase", "purchase"]);
    expect(report.createdEvents).toHaveLength(1);
    expect(report.modifiedEvents).toHaveLength(2);
    expect(report.crossDomains).toEqual(["nosdeu\\.com", "braiscalvo\\.com"]);
    expect(report.unwantedReferrals).toEqual(["paypal"]);
  });

  it("decodes created and modified event rules", () => {
    const [purchase] = report.createdEvents;
    expect(purchase.name).toBe("purchase");
    expect(purchase.sourceEvent).toBe("page_view");
    expect(purchase.conditions[1]).toMatchObject({ parameter: "page_location", operator: "contains", ignoreCase: true, value: "order-confirmation" });
    expect(report.modifiedEvents.map((rule) => [rule.sourceEvent, rule.name])).toEqual([["AddToCart", "add_to_cart"], ["SignUp", "sign_up"]]);
  });

  it("reads Google tag and consent settings", () => {
    expect(report.enhancedMeasurement?.items.filter((item) => item.on).map((item) => item.key)).toEqual(["page_view", "scroll", "video", "download", "form"]);
    expect(report.autoEventDetection?.items.find((item) => item.key === "video")?.on).toBe(false);
    expect(report.session).toEqual({ hours: 0, minutes: 25, engagementSeconds: 10 });
    expect(report.redaction).toEqual({ email: true, queryParams: ["name", "lastname"] });
    expect(report.dataUse?.mode).toBe("SOME");
    expect(report.dataExtraction).toEqual([{ parameter: "currency", mode: "JavaScript variable", location: "window.currency" }]);
    expect(report.connectedTags).toEqual([{ id: "AW-98675", product: "Google Ads" }]);
    expect(report.dmaDefaults).toEqual({ value: "GRANTED", delegationMode: "OFF" });
    expect(report.consentOverrides?.analytics.denied).toBe(true);
    expect(report.consentOverrides?.ads.denied).toBe(false);
    expect(report.googleSignals).toBe("ENABLED");
    expect(report.granularLocation?.regions).toEqual(["AD", "AS", "DZ"]);
    expect(report.userDataCollection).toMatchObject({ autoDetected: true, stitching: true });
    expect(report.unrecognized).toEqual([]);
  });
});

describe("parseGa4 — G-YD3MXGJLTX", () => {
  const report = parseGa4(fixture("G-YD3MXGJLTX"), "G-YD3MXGJLTX", "x");

  it("matches the counts shown by the reference site", () => {
    expect(report.libraryVersion).toBe("21");
    expect(report.keyEvents).toHaveLength(21);
    expect(report.createdEvents).toHaveLength(15);
    expect(report.modifiedEvents).toHaveLength(0);
    expect(report.crossDomains).toHaveLength(3);
    expect(report.unwantedReferrals).toHaveLength(9);
    expect(report.internalTrafficRules).toHaveLength(2);
  });

  it("keeps negated regex conditions and parameter operations", () => {
    const rule = report.createdEvents.find((item) => item.operations.length);
    expect(rule?.operations).toContainEqual({ action: "SET", parameter: "currency", value: "USD" });
    const negated = report.createdEvents.flatMap((item) => item.conditions).find((condition) => condition.negate);
    expect(negated).toMatchObject({ parameter: "page_path", code: "rei", operator: "matches regex" });
  });

  it("reports stitching off when the tag has no enhanced-conversion signal rule", () => {
    expect(report.userDataCollection?.stitching).toBe(false);
    expect(report.enhancedMeasurement?.siteSearch?.queryParams).toEqual(["q", "s", "search", "query", "keyword"]);
  });
});

it("rejects responses without a compiled configuration", () => {
  expect(() => parseGa4("console.log('nope')", "G-XXXXXXX", "x")).toThrow();
});
