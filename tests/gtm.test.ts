import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { exportContainer } from "@/lib/gtm/export";
import { parseGtm } from "@/lib/gtm/parse";

// Real public gtm.js responses captured on 2026-09-24 (see tests/fixtures).
const fixture = (id: string) => fs.readFileSync(`tests/fixtures/gtm-${id}.js`, "utf8");

describe("parseGtm — GTM-N233G8C", () => {
  const source = fixture("GTM-N233G8C");
  const container = parseGtm(source, "GTM-N233G8C", "x");

  it("matches the counts shown by the reference site", () => {
    expect(container.version).toBe("80");
    expect(container.tags).toHaveLength(49);
    expect(container.triggers).toHaveLength(33);
    expect(container.variables).toHaveLength(50);
    expect(container.stats.active).toBe(35);
    expect(container.stats.paused).toBe(14);
    expect(container.stats.unusedTriggers).toBe(1);
    expect(container.stats.customCode).toBe(8);
    expect(container.listenerCount).toBe(19);
  });

  it("names tags and links them to triggers", () => {
    const phone = container.tags.find((tag) => tag.name === "GA4 Event — Phone Call")!;
    expect(phone.identifiers).toEqual([{ label: "Event name", value: "Phone Call" }, { label: "Measurement ID", value: "G-YD3MXGJLTX" }]);
    expect(phone.firingTriggers.map((id) => container.triggers.find((trigger) => trigger.id === id)!.type)).toEqual(["All Elements", "Just Links"]);
    expect(container.tags.find((tag) => tag.vendor === "Microsoft Clarity")?.html).toContain("clarity.ms");
    const lead = container.tags.find((tag) => tag.name === "Custom HTML — Meta Pixel (Lead)")!;
    expect(lead.setupTag?.tag).toBe(container.tags.find((tag) => tag.name === "Custom HTML — Meta Pixel (PageView)")!.id);
  });

  it("rebuilds trigger conditions, including negated ones", () => {
    const contact = container.triggers.find((trigger) => trigger.name.startsWith("Page View — Page URL contains /thank-you-for-contact-us"))!;
    expect(contact.conditions.map((condition) => `${condition.left} ${condition.operator} ${condition.right}`)).toEqual([
      "Page URL contains /thank-you-for-contact-us",
      "Page URL does not contain form=subscribe_newsletter",
      "Page URL does not contain form=add_your_testimonial",
    ]);
    expect(contact.firesTags).toHaveLength(2);
    const scroll = container.triggers.find((trigger) => trigger.type === "Scroll Depth")!;
    expect(scroll.listener?.params.find((param) => param.key === "verticalThresholdsPercent")?.value).toEqual({ kind: "text", text: "15, 25, 50, 75, 100", refs: [] });
  });

  it("groups destinations with their IDs", () => {
    const byName = Object.fromEntries(container.destinations.map((group) => [group.name, group]));
    expect(byName["Google Analytics"].ids.map((item) => item.id)).toEqual(["UA-26445561-1", "G-YD3MXGJLTX"]);
    expect(byName["Google Ads"].ids.map((item) => item.id)).toEqual(["AW-16701540396"]);
    expect(byName["Meta Pixel"].ids.map((item) => item.id)).toEqual(["900429971548466"]);
  });

  it("exports a Tag Manager import file that references only known triggers", () => {
    const { json, skipped } = exportContainer(source, container);
    const version = (json as { containerVersion: { tag: { firingTriggerId: string[]; type: string; name: string; parameter: { key: string; value?: string }[] }[]; trigger: { triggerId: string; type: string; customEventFilter?: unknown[] }[]; variable: unknown[]; builtInVariable: { type: string }[] } }).containerVersion;
    expect(skipped).toEqual([]);
    expect(version.tag).toHaveLength(49);
    expect(version.trigger).toHaveLength(33);
    const triggerIds = new Set(version.trigger.map((trigger) => trigger.triggerId));
    for (const tag of version.tag) for (const id of tag.firingTriggerId) expect(triggerIds.has(id)).toBe(true);
    expect(new Set(version.tag.map((tag) => tag.name)).size).toBe(49);
    const clarity = version.tag.find((tag) => tag.name === "Custom HTML — Microsoft Clarity")!;
    expect(clarity.parameter.find((param) => param.key === "html")?.value).not.toContain("text/gtmscript");
    expect(version.trigger.find((trigger) => trigger.type === "CUSTOM_EVENT")?.customEventFilter).toHaveLength(1);
    expect(version.builtInVariable.map((item) => item.type)).toContain("CLICK_URL");
  });
});

describe("parseGtm — GTM-KM3ML3HS", () => {
  const container = parseGtm(fixture("GTM-KM3ML3HS"), "GTM-KM3ML3HS", "x");

  it("matches the counts shown by the reference site", () => {
    expect(container.version).toBe("62");
    expect(container.tags).toHaveLength(67);
    expect(container.triggers).toHaveLength(45);
    expect(container.variables).toHaveLength(30);
    expect(container.stats.paused).toBe(7);
    expect(container.stats.unusedTriggers).toBe(0);
  });

  it("recognizes gallery templates by their parameters", () => {
    const meta = container.tags.filter((tag) => tag.fn.startsWith("cvt_"));
    expect(meta.length).toBe(4);
    expect(meta.every((tag) => tag.vendor === "Meta Pixel")).toBe(true);
  });
});
