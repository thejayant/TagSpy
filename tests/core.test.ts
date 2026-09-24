import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { decode, extractDataJson } from "@/lib/compiled";
import { contentHash, diffGa4, diffGtm } from "@/lib/diff";
import { parseGa4 } from "@/lib/ga4/parse";
import { parseGtm } from "@/lib/gtm/parse";
import { findIds, idKind, parseInput } from "@/lib/ids";
import { isPrivateAddress } from "@/lib/url-safety";

describe("ids", () => {
  it("classifies IDs and URLs", () => {
    expect(idKind("gtm-n233g8c")).toBe("GTM");
    expect(idKind("G-6SET8QZ3TV")).toBe("GA4");
    expect(idKind("GT-TNHG4H32")).toBe("GT");
    expect(parseInput(" example.com/path#x ")).toEqual({ type: "url", url: "https://example.com/path" });
    expect(() => parseInput("javascript:alert(1)")).toThrow();
    expect(() => parseInput("https://user:pw@example.com")).toThrow();
    expect(() => parseInput("localhost")).toThrow();
  });

  it("finds IDs in HTML", () => {
    const html = `<script src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234"></script><script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-ABC1234');gtag('config','AW-123456789')</script>`;
    expect(findIds(html)).toEqual({ gtm: ["GTM-ABC1234"], ga4: ["G-ABCDEF1234"], gt: [], aw: ["AW-123456789"] });
  });
});

describe("compiled data", () => {
  it("extracts the data object without evaluating code, including braces inside strings", () => {
    const source = `var x=1;var data = {"resource":{"tags":[{"vtp_html":"<script>if(a){b()}</script>"}]}};alert("{");`;
    expect(extractDataJson(source)).toEqual({ resource: { tags: [{ vtp_html: "<script>if(a){b()}</script>" }] } });
  });

  it("decodes map/list encoding and keeps macro references", () => {
    expect(decode(["list", ["map", "a", 1, "b", ["macro", 3]]])).toEqual([{ a: 1, b: ["macro", 3] }]);
  });
});

describe("diff", () => {
  const ga4 = parseGa4(fs.readFileSync("tests/fixtures/gtag-G-6SET8QZ3TV.js", "utf8"), "G-6SET8QZ3TV", "x");
  const gtm = parseGtm(fs.readFileSync("tests/fixtures/gtm-GTM-N233G8C.js", "utf8"), "GTM-N233G8C", "x");

  it("ignores fetch time when hashing", () => {
    expect(contentHash({ ...ga4, fetchedAt: "2020-01-01T00:00:00Z" })).toBe(contentHash(ga4));
  });

  it("reports GA4 key event and rule changes", () => {
    const after = structuredClone(ga4);
    after.keyEvents = [...after.keyEvents.filter((name) => name !== "first_open"), "sign_up"];
    after.createdEvents[0].conditions[1].value = "thank-you";
    expect(diffGa4(ga4, after)).toEqual([
      { area: "Key events", change: "added", label: "sign_up" },
      { area: "Key events", change: "removed", label: "first_open" },
      { area: "Create custom events", change: "changed", label: "purchase", detail: "Changed conditions" },
    ]);
  });

  it("reports GTM tag changes by stable tag id", () => {
    const after = structuredClone(gtm);
    after.version = "81";
    after.tags = after.tags.filter((tag) => !tag.name.includes("Clarity"));
    const phone = after.tags.find((tag) => tag.name === "GA4 Event — Phone Call")!;
    phone.paused = true;
    const entries = diffGtm(gtm, after);
    expect(entries).toContainEqual({ area: "Container", change: "changed", label: "Published version", detail: "v80 → v81" });
    expect(entries).toContainEqual({ area: "Tags", change: "removed", label: "Custom HTML — Microsoft Clarity" });
    expect(entries).toContainEqual({ area: "Tags", change: "changed", label: "GA4 Event — Phone Call", detail: "paused" });
  });
});

describe("url safety", () => {
  it("blocks private and reserved addresses", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "169.254.169.254", "::1", "fd00::1"]) expect(isPrivateAddress(address)).toBe(true);
    expect(isPrivateAddress("142.250.72.14")).toBe(false);
  });
});

describe("pasted page source", () => {
  it("finds container and measurement IDs in copied HTML", async () => {
    const { idsFromSource } = await import("@/lib/discover");
    const html = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234"></script><script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-ABC1234');</script>`;
    expect(idsFromSource(html)).toEqual([
      { id: "GTM-ABC1234", kind: "GTM", via: "pasted page source" },
      { id: "G-ABCDEF1234", kind: "GA4", via: "pasted page source" },
    ]);
    expect(idsFromSource("<html></html>")).toEqual([]);
  });
});
