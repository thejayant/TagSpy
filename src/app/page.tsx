import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon, ProductGlyph, SiteFooter, SiteHeader } from "@/components/chrome";
import { TechMarquee } from "@/components/home/marquee";
import { Story } from "@/components/home/story";
import { XrayStage } from "@/components/home/xray";
import { Omnibox } from "@/components/omnibox";
import { SeoGuide, StructuredData } from "@/components/seo-guide";
import { SupportSection } from "@/components/support";
import { GUIDES, TOOL_ORDER, guideMetadata } from "@/lib/seo";

export const metadata: Metadata = guideMetadata("home");

/** What each tool card leads with. */
const CARD: Record<string, { glyph: "ga4" | "gtm" | "meta" | "segment" | "site" | "ai"; label: string; fresh?: boolean }> = {
  ai: { glyph: "ai", label: "Detect AI-built sites", fresh: true },
  site: { glyph: "site", label: "Tech stack, fonts & design" },
  ga4: { glyph: "ga4", label: "Google Analytics 4" },
  gtm: { glyph: "gtm", label: "Google Tag Manager" },
  meta: { glyph: "meta", label: "Facebook / Meta Pixel" },
  segment: { glyph: "segment", label: "Segment CDP" },
};

/**
 * The headline, split into letters on the server so its cascade is pure CSS and starts with the first paint (no wait
 * for JavaScript). Screen readers get the sentence once, from aria-label.
 */
function Headline({ lines }: { lines: { text: string; accent?: boolean }[] }) {
  let index = 0;
  return (
    <h1 className="xh-title" aria-label={lines.map((line) => line.text).join(" ")}>
      {lines.map((line) => {
        // --k is the letter's position along its line (0–1), so an accent gradient flows across the whole line.
        const letters = line.text.replace(/ /g, "").length;
        let position = 0;
        return (
          <span className={`xh-line${line.accent ? " accent" : ""}`} key={line.text} aria-hidden="true">
            {line.text.split(" ").map((word, w, words) => (
              <span className="xh-word" key={`${word}-${w}`}>
                {[...word].map((char, c) => {
                  const style = { "--i": index++, "--k": position++ / Math.max(1, letters - 1) } as CSSProperties;
                  return <span className="xh-char" style={style} key={c}>{char}</span>;
                })}
                {w < words.length - 1 ? " " : null}
              </span>
            ))}
          </span>
        );
      })}
    </h1>
  );
}

/** The landing page: the X-ray hero, the story of a scan, every technology we read, and every tool one click away. */
export default function Home() {
  return (
    <>
      <StructuredData slug="home" />
      <SiteHeader />
      <main className="home-main">
        <section className="xh" aria-label="TagSpy">
          <div className="xh-copy">
            <p className="eyebrow xh-eyebrow">Free website inspector</p>
            <Headline lines={[{ text: "See inside" }, { text: "any website.", accent: true }]} />
            <p className="xh-sub">Its analytics and tag setup, the tech stack and fonts it&rsquo;s built with, and whether AI built it. Read from the public files every browser downloads: free, no login, nothing stored.</p>
            <Omnibox />
            <p className="home-hint small">Type a website, a tag ID or a question. Press <kbd>Ctrl</kbd> <kbd>K</kbd> on any page to search.</p>
          </div>
          <XrayStage />
        </section>

        <TechMarquee />

        <Story />

        <div className="page home">
          <section className="home-tools" aria-label="Tools">
            {TOOL_ORDER.map((slug) => {
              const guide = GUIDES[slug];
              const card = CARD[slug];
              return (
                <Link href={guide.path} className="home-tool glass" key={slug}>
                  {card.glyph === "ai" ? <span className="app-icon g-purple"><Icon name="neurology" fill /></span> : <ProductGlyph kind={card.glyph} size="large" />}
                  <span className="home-tool-body">
                    <span className="home-tool-label mono">{card.label}{card.fresh && <em>New</em>}</span>
                    <strong>{guide.name}</strong>
                    <small>{guide.tagline}</small>
                  </span>
                  <Icon name="arrow_forward" className="home-tool-arrow" />
                </Link>
              );
            })}
          </section>

          <section className="home-proof" aria-label="At a glance">
            <div><strong data-countup>230</strong><span>technologies recognized</span></div>
            <div><strong data-countup>16</strong><span>AI builders and agents detected</span></div>
            <div><strong>0</strong><span>logins, installs or stored scans</span></div>
          </section>

          <SupportSection />

          <SeoGuide slug="home" />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
