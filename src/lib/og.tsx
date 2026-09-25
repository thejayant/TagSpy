import { ImageResponse } from "next/og";
import { GUIDES, type GuideSlug } from "./seo";

/** Social share cards (Open Graph and X): 1200×630, built at compile time, in TagSpy's dark Refract look. */
export const OG_SIZE = { width: 1200, height: 630 };

export function ogImage(slug: GuideSlug) {
  const guide = GUIDES[slug];
  const headline = slug === "home" ? "See inside any website." : guide.title.split(":")[0];
  const sub = slug === "home" ? "GA4 · Tag Manager · Meta Pixel · Segment · Tech stack · AI detection" : guide.tagline;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", color: "#eef1fb", backgroundColor: "#06070d", backgroundImage: "radial-gradient(circle at 18% 12%, rgba(45,200,210,0.35), transparent 42%), radial-gradient(circle at 85% 20%, rgba(92,116,255,0.45), transparent 45%), radial-gradient(circle at 70% 95%, rgba(160,100,255,0.35), transparent 50%)" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 800, letterSpacing: -2 }}>
          <span>tag</span>
          <span style={{ color: "#8a8cff" }}>spy</span>
          <span style={{ width: 12, height: 12, borderRadius: 12, marginLeft: 6, marginBottom: 18, backgroundColor: "#45dcd8" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: headline.length > 22 ? 76 : 92, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02 }}>{headline}</div>
          <div style={{ fontSize: 34, marginTop: 22, color: "rgba(226,232,255,0.7)" }}>{sub}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24, color: "rgba(226,232,255,0.6)" }}>
          <div style={{ display: "flex", padding: "10px 22px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.06)", color: "#45dcd8" }}>Free · no login · nothing stored</div>
          <div style={{ display: "flex" }}>by thejayant</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
