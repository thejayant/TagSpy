import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diffSite } from "@/lib/diff";
import { fingerprint, siteAddress } from "@/lib/site/fingerprint";
import { mergeRuntime } from "@/lib/site/merge";
import type { RuntimeReport, SiteReport, Tech } from "@/lib/site/types";

const tech = (name: string, category: Tech["category"], version: string | null = null, extra: Partial<Tech> = {}): Tech => ({ name, category, version, confidence: "high", description: "", website: null, color: null, evidence: [{ where: "HTML", match: name }], implied: false, ...extra });

function staticReport(): SiteReport {
  return {
    url: "https://example.com/", finalUrl: "https://www.example.com/Work/", host: "www.example.com", fetchedAt: "2026-01-01T00:00:00Z", durationMs: 1000, source: "url", recipe: "",
    techs: [tech("Next.js", "Meta-framework", "16.2.4"), tech("React", "Framework", null, { implied: true, confidence: "medium" }), tech("Vercel", "Hosting")],
    wordpress: null,
    experience: [
      { key: "smooth", label: "Smooth scrolling", description: "", on: false, detail: null },
      { key: "webgl", label: "WebGL / 3D", description: "", on: false, detail: null },
      { key: "reduced", label: "Respects reduced motion", description: "", on: false, detail: null },
    ],
    shaders: 0, fonts: [],
    tokens: { colors: [{ value: "#ff3b00", count: 3, kind: "color", variable: null }], customProperties: 0, fontStacks: [], fontSizes: [], fluidType: [], radii: [], breakpoints: [], shadows: 0, darkMode: false, features: [], keyframes: 0, transitions: 0 },
    infra: null, dns: null, assets: [{ url: "https://www.example.com/_next/a.js", kind: "script", bytes: 10, firstParty: true, techs: [] }], sourceMaps: [],
    totals: { html: 1, js: 1, css: 1, fonts: 0, scripts: 1, styles: 0, skipped: 0, failed: 0 },
    page: { title: null, description: null, lang: null, hreflang: [], canonical: null, generator: null, themeColor: null, ogImage: null, robots: null, jsonLdTypes: [], manifest: false, trackingIds: [] },
    insights: [], limits: ["Only what the first page load serves is read."],
  };
}

function runtime(): RuntimeReport {
  return {
    finalUrl: "https://www.example.com/Work/", provider: "local", startedAt: "", durationMs: 20_000, partial: false, blocked: null,
    globals: [{ name: "React", version: "19.2.0", detail: "react-dom renderer" }, { name: "three.js", version: "185", detail: null }, { name: "Lenis", version: "1.3.23", detail: null }],
    network: { requests: 10, transferBytes: 1000, byType: [], thirdParty: [], lazyScripts: 0, assets3d: [{ url: "https://www.example.com/scene.glb", kind: "GLB", bytes: 5000 }], media: [{ url: "https://www.example.com/click.wav", kind: "WAV", bytes: 0 }], vector: [], blocked: 0 },
    fonts: [], typeScale: [], webgl: { contexts: [{ type: "webgl2", width: 1280, height: 800 }], shaders: 12, shaderSamples: [], drawCalls: 400, webgpu: false },
    animations: { total: 0, running: 4, css: 4, transitions: 0, scripted: 0, names: [] },
    scroll: { library: "Lenis", container: null, virtual: false, wheelListeners: 1, pageHeight: 5000 },
    reducedMotion: { tested: true, normalRunning: 4, reducedRunning: 0, smoothScrollDisabled: true, respects: true },
    vitals: { fcp: 800, lcp: 1900, cls: 0, longTasks: 1, totalBlockingTime: 40, domContentLoaded: 500, load: 900, jsHeapMB: 20 },
    screenshots: [],
  };
}

describe("deep scan merge", () => {
  const merged = mergeRuntime(staticReport(), runtime(), [tech("GSAP", "Animation", "3.15.0", { evidence: [{ where: "/_next/lazy.js", match: "_gsap" }] })], ["https://www.example.com/_next/a.js", "https://www.example.com/_next/lazy.js"]);
  const byName = new Map(merged.techs.map((item) => [item.name, item]));

  it("confirms, versions and adds technologies from the running page", () => {
    expect(byName.get("React")).toMatchObject({ version: "19.2.0", implied: false, seenAt: "both", confidence: "high" });
    expect(byName.get("three.js")).toMatchObject({ version: "185", seenAt: "runtime", category: "3D & WebGL" });
    expect(byName.get("GSAP")?.evidence[0].where).toBe("runtime · /_next/lazy.js");
    expect(byName.get("Vercel")?.seenAt).toBe("static");
  });

  it("updates motion signals with tested behaviour and adds sound", () => {
    const signals = new Map(merged.experience.map((item) => [item.key, item]));
    expect(signals.get("webgl")?.on).toBe(true);
    expect(signals.get("smooth")?.detail).toBe("Lenis");
    expect(signals.get("reduced")?.on).toBe(true);
    expect(signals.get("audio")?.on).toBe(true);
    expect(merged.runtime?.network.lazyScripts).toBe(1);
    expect(merged.recipe).toMatch(/three\.js/);
    expect(merged.limits.some((line) => line.startsWith("Only what the first page load"))).toBe(false);
  });
});

describe("site snapshots", () => {
  it("keys sites by host and case-preserved path", () => {
    expect(siteAddress("https://WWW.RockstarGames.com/VI/?utm=x")).toBe("rockstargames.com/VI");
  });

  it("ignores implied and runtime-only techs, and diffs stack, fonts and palette", () => {
    const before = fingerprint(staticReport());
    expect(before.techs.map((item) => item.name)).toEqual(["Next.js", "Vercel"]);
    const after = { ...before, techs: [{ name: "Next.js", category: "Meta-framework", version: "16.3.0" }, { name: "Netlify", category: "Hosting", version: null }], hosting: ["Netlify"], colors: ["#000000", "#111111"] };
    const entries = diffSite(before, after);
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ area: "Stack", change: "changed", detail: "version 16.2.4 → 16.3.0" }),
      expect.objectContaining({ area: "Stack", change: "removed", label: "Vercel (Hosting)" }),
      expect.objectContaining({ area: "Hosting", change: "added", label: "Netlify" }),
      expect.objectContaining({ area: "Design", label: "Color palette" }),
    ]));
  });
});

describe("async storage", () => {
  it("stores snapshots once per content hash and counts rate limits atomically", async () => {
    process.env.DATABASE_PATH = path.join(os.tmpdir(), `tagspy-test-${process.pid}-${Date.now()}.db`);
    const db = await import("@/lib/db");
    const first = await db.upsertSnapshot("site", "example.com", undefined, "h1", "2026-01-01", { a: 1 });
    const again = await db.upsertSnapshot("site", "example.com", undefined, "h1", "2026-01-02", { a: 1 });
    const changed = await db.upsertSnapshot("site", "example.com", undefined, "h2", "2026-01-03", { a: 2 });
    expect(first.isNew).toBe(true);
    expect(again).toMatchObject({ isNew: false, previous: undefined });
    expect(changed.previous?.hash).toBe("h1");
    expect(await db.checkRateLimit("t", 2)).toBe(true);
    expect(await db.checkRateLimit("t", 2)).toBe(true);
    expect(await db.checkRateLimit("t", 2)).toBe(false);
  });

  it("deletes a target's history when its last follower leaves", async () => {
    const db = await import("@/lib/db");
    const watch = await db.createWatch({ id: "w1", kind: "site", target: "followed.dev", email: "a@b.co", webhook: null });
    await db.upsertSnapshot("site", "followed.dev", undefined, "x", "2026-01-01", {});
    expect(await db.listSnapshots("site", "followed.dev")).toHaveLength(1);
    await db.deleteWatch(watch.id);
    expect(await db.listSnapshots("site", "followed.dev")).toHaveLength(0);
  });

  it("allows a fixed number of deep scans per visit and refunds failures", async () => {
    const db = await import("@/lib/db");
    const key = "deep:visit-1";
    expect(await db.consumeQuota(key, 3)).toBe(true);
    expect(await db.consumeQuota(key, 3)).toBe(true);
    expect(await db.consumeQuota(key, 3)).toBe(true);
    expect(await db.consumeQuota(key, 3)).toBe(false);
    expect(await db.quotaUsed(key)).toBe(3);
    await db.refundQuota(key);
    expect(await db.quotaUsed(key)).toBe(2);
  });
});
