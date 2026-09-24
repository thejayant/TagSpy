import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { findPixelIds } from "@/lib/ids";
import { parseMetaPixel } from "@/lib/meta/parse";

const fixture = (name: string) => fs.readFileSync(`tests/fixtures/${name}`, "utf8");
const url = (id: string) => `https://connect.facebook.net/signals/config/${id}?v=2.9.200&r=stable`;

describe("Meta Pixel config", () => {
  const withGateway = parseMetaPixel(fixture("meta-177222721382891.js"), "177222721382891", url("177222721382891"));
  const withRules = parseMetaPixel(fixture("meta-1882987898627194.js"), "1882987898627194", url("1882987898627194"));

  it("reads advanced matching, the Conversions API Gateway and first-party identity", () => {
    expect(withGateway.automaticMatching.enabled).toBe(true);
    expect(withGateway.automaticMatching.keys.map((key) => key.label)).toEqual(expect.arrayContaining(["Email", "Phone", "External ID"]));
    expect(withGateway.conversionsApiGateway).toBe(true);
    expect(withGateway.identity.firstPartyCookies).toBe(true);
    expect(withGateway.identity.clickIdParams.map((item) => item.param)).toEqual(["fbclid", "brid", "waaem"]);
    expect(withRules.automaticMatching.enabled).toBe(false);
    expect(withRules.conversionsApiGateway).toBe(false);
  });

  it("decodes Event Setup Tool rules into sentences", () => {
    expect(withRules.codelessEvents.length).toBeGreaterThan(2);
    const [first] = withRules.codelessEvents;
    expect(first).toMatchObject({ id: "388045865063810", event: "Purchase", active: true, match: "all" });
    expect(first.conditions[0]).toMatchObject({ trigger: "clicks", target: "a button", field: "text", operator: "equals", value: "submit" });
    expect(first.sentence).toBe('When a visitor clicks a button whose text equals "submit", send Purchase');
    expect(withRules.codelessEvents[1].conditions[0].value).toBe("▼");
  });

  it("lists blocked parameters, features, rollout flags and a setup score", () => {
    expect(withRules.restrictions.blockedParams).toEqual([{ event: "PageView", urlParams: ["last_name", "first_name", "mobile", "payload", "s"], customData: [] }]);
    expect(withRules.features.find((feature) => feature.key === "ESTRuleEngine")?.name).toBe("Codeless events");
    expect(withGateway.rolloutFlags.length).toBeGreaterThan(5);
    expect(withGateway.score.value).toBeGreaterThan(withRules.score.value);
    expect(withGateway.score.value).toBeLessThanOrEqual(100);
  });

  it("rejects pixel IDs Meta has no configuration for", () => {
    expect(() => parseMetaPixel(fixture("meta-unknown.js"), "1234567890123456", url("1234567890123456"))).toThrow(/no public configuration/);
  });

  it("finds pixel IDs in page source and in GTM Custom HTML", () => {
    expect(findPixelIds(`<script>fbq('init', '1882987898627194');</script><img src="https://www.facebook.com/tr?id=177222721382891&ev=PageView">`)).toEqual(["1882987898627194", "177222721382891"]);
    expect(findPixelIds(String.raw`"vtp_html":"<script>fbq('init', '555666777888999');"`)).toEqual(["555666777888999"]);
    expect(findPixelIds(`{"vtp_pixelId":"123456789012345"}`)).toEqual(["123456789012345"]);
  });
});
