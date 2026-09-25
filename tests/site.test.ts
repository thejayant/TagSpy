import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { detect } from "@/lib/site/detect";
import { parseFontFaces, parseFontFile, parseUnicodeRange, scriptCoverage } from "@/lib/site/fonts";
import { apexDomain } from "@/lib/site/network";
import { readSourceMap, sourceMapUrl } from "@/lib/site/sourcemap";
import { extractTokens, normalizeColor } from "@/lib/site/tokens";

const empty = { html: "", urls: [], js: [], css: [], headers: {}, cookies: [], meta: {} };

describe("site detection", () => {
  it("finds frameworks, versions and implied technologies", () => {
    const { techs } = detect({
      ...empty,
      html: `<script src="/_next/static/chunks/turbopack-abc.js"></script><script>self.__next_f.push([1,""])</script>`,
      urls: ["https://example.com/_next/static/chunks/turbopack-abc.js"],
      js: [{ url: "https://example.com/_next/static/chunks/a.js", text: `window.next={version:"16.2.4",appDir:!0};reconcilerVersion:"19.2.0";e._gsap;ee.version=fe.version=Mt.version="3.13.0";window.lenisVersion="1.3.4"` }],
      headers: { "x-vercel-id": "bom1::abc", server: "Vercel" },
    }, "example.com");
    const byName = new Map(techs.map((tech) => [tech.name, tech]));
    expect(byName.get("Next.js")?.version).toBe("16.2.4");
    expect(byName.get("React")?.version).toBe("19.2.0");
    expect(byName.get("GSAP")?.version).toBe("3.13.0");
    expect(byName.get("Lenis")?.version).toBe("1.3.4");
    expect(byName.has("Next.js App Router")).toBe(true);
    expect(byName.has("Turbopack")).toBe(true);
    expect(byName.has("Vercel")).toBe(true);
    expect(byName.get("Node.js")?.implied).toBe(true);
  });

  it("reads versions from template-literal bundles and ignores plugin requirement messages", () => {
    const { techs } = detect({ ...empty, js: [{ url: "https://x.dev/assets/gsap.js", text: "console.warn(`Requires GSAP 3.11.0 or later`);t._gsap;Sn.version=cn.version=Xn.version=`3.15.0`" }] }, "x.dev");
    expect(techs.find((tech) => tech.name === "GSAP")?.version).toBe("3.15.0");
  });

  it("does not mistake ScrollTrigger's reference to ScrollSmoother for ScrollSmoother", () => {
    const { techs } = detect({ ...empty, js: [{ url: "https://x.dev/st.js", text: `_gsap;forEach(function(e){return"ScrollSmoother"!==e.vars.id&&e.kill()});pin-spacer` }] }, "x.dev");
    expect(techs.map((tech) => tech.name)).toContain("GSAP ScrollTrigger");
    expect(techs.map((tech) => tech.name)).not.toContain("GSAP ScrollSmoother");
  });

  it("infers backends from cookies with lower confidence", () => {
    const { techs } = detect({ ...empty, cookies: ["PHPSESSID", "laravel_session"], headers: { server: "nginx/1.25.3" } }, "x.dev");
    expect(techs.find((tech) => tech.name === "Laravel")?.confidence).toBe("medium");
    expect(techs.find((tech) => tech.name === "nginx")?.version).toBe("1.25.3");
    expect(techs.some((tech) => tech.name === "PHP")).toBe(true);
  });
});

describe("fonts", () => {
  it("reads a WOFF2 file's names, license and coverage", () => {
    const info = parseFontFile(fs.readFileSync("tests/fixtures/dm-mono-latin.woff2"), "https://fonts.gstatic.com/dm-mono.woff2");
    expect(info.format).toBe("woff2");
    expect(info.family).toBe("DM Mono");
    expect(info.licenseUrl).toMatch(/scripts\.sil\.org\/OFL|openfontlicense\.org/);
    expect(info.glyphs).toBeGreaterThan(100);
    expect(info.scripts.map((item) => item.name)).toContain("Latin");
  });

  it("parses Google Fonts @font-face rules with subset comments", () => {
    const faces = parseFontFaces(fs.readFileSync("tests/fixtures/google-fonts-dm-mono.css", "utf8"), "https://fonts.googleapis.com/css2", "example.com");
    const face = faces.get("dm mono")!;
    expect(face.source).toBe("Google Fonts");
    expect(face.weights).toEqual(["400"]);
    expect(face.scripts).toEqual(expect.arrayContaining(["Latin", "Latin Extended"]));
  });

  it("maps unicode ranges to writing systems", () => {
    expect(scriptCoverage(parseUnicodeRange("U+0000-00FF, U+0400-045F")).map((item) => item.name)).toEqual(["Latin", "Cyrillic"]);
    expect(parseUnicodeRange("U+4??")).toEqual([[0x400, 0x4ff]]);
  });
});

describe("design tokens", () => {
  it("normalizes colors", () => {
    expect(normalizeColor("#ABC")).toBe("#aabbcc");
    expect(normalizeColor("rgb(255 0 0 / 50%)")).toBe("#ff000080");
    expect(normalizeColor("hsl(0, 0%, 100%)")).toBe("#ffffff");
    expect(normalizeColor("rgba(0,0,0,0)")).toBeNull();
  });

  it("extracts palette, breakpoints and modern CSS", () => {
    const tokens = extractTokens(`:root{--brand:#ff3b00;--ink:#111}a{color:#ff3b00;font-family:"Inter",sans-serif}@media (min-width:48rem){h1{font-size:clamp(2rem,5vw,4rem)}}.c{container-type:inline-size}@container (min-width:400px){.x{color:red}}.p:has(img){border-radius:12px}`);
    expect(tokens.colors[0]).toMatchObject({ value: "#ff3b00", count: 2, kind: "color", variable: "--brand" });
    expect(tokens.breakpoints).toEqual(["400px", "768px"]);
    expect(tokens.fluidType).toEqual(["clamp(2rem,5vw,4rem)"]);
    expect(tokens.features.map((item) => item.name)).toEqual(expect.arrayContaining(["Container queries", ":has() selector", "Fluid sizing"]));
  });
});

describe("source maps and DNS helpers", () => {
  it("lists npm packages and pnpm versions from a source map", () => {
    const map = JSON.stringify({ sources: ["webpack://_N_E/./node_modules/.pnpm/gsap@3.12.5/node_modules/gsap/index.js", "webpack://_N_E/./node_modules/@react-three/fiber/dist/index.js", "webpack://_N_E/./src/app/page.tsx"], sourcesContent: ["abcd", "ab", "x"] });
    const info = readSourceMap("https://x.dev/a.js", "https://x.dev/a.js.map", map)!;
    expect(info.packages.map((item) => [item.name, item.version])).toEqual([["gsap", "3.12.5"], ["@react-three/fiber", null]]);
    expect(info.ownFiles).toEqual(["src/app/page.tsx"]);
    expect(sourceMapUrl("https://x.dev/js/a.js", "var a;\n//# sourceMappingURL=a.js.map", null)).toBe("https://x.dev/js/a.js.map");
  });

  it("finds the registrable domain", () => {
    expect(apexDomain("www.rockstargames.com")).toBe("rockstargames.com");
    expect(apexDomain("shop.example.co.uk")).toBe("example.co.uk");
  });
});
