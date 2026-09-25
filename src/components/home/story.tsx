"use client";

import gsap from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";
import { Icon } from "../chrome";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);

/**
 * "One address in. Everything out." A pinned, scroll-scrubbed scene: an address types itself into the bar, the scan
 * pulses, and six reports fly out of it into a grid, their numbers counting as they land. Scrolling back rewinds it.
 * Phones and reduced motion get the finished grid (revealed by the motion engine) instead of the pinned scene.
 */

const REPORTS = [
  { key: "ga4", icon: "query_stats", label: "GA4", big: 14, unit: "events", lines: ["page_view", "sign_up", "purchase"], tone: "#f9ab00" },
  { key: "gtm", icon: "sell", label: "Tag Manager", big: 38, unit: "tags", lines: ["9 destinations", "4 paused", "2 custom HTML"], tone: "#4f86ff" },
  { key: "meta", icon: "ads_click", label: "Meta Pixel", big: 82, unit: "/ 100", lines: ["6 codeless rules", "Advanced matching", "CAPI gateway"], tone: "#1877f2" },
  { key: "stack", icon: "deployed_code", label: "Tech stack", big: 23, unit: "technologies", lines: ["Next.js 16", "React 19", "Vercel"], tone: "#8a8cff" },
  { key: "fonts", icon: "match_case", label: "Typography", big: 3, unit: "typefaces", lines: ["Sora · Indian Type Foundry", "Inter · Rasmus Andersson", "JetBrains Mono"], tone: "#45dcd8" },
  { key: "ai", icon: "neurology", label: "AI check", big: 12, unit: "% AI", lines: ["Hand-built", "No builder traces", "High confidence"], tone: "#3ee0a1" },
];

export function Story() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
      const stage = section.querySelector<HTMLElement>(".story-stage")!;
      const bar = section.querySelector<HTMLElement>(".story-bar")!;
      const typed = section.querySelector<HTMLElement>(".story-typed")!;
      const cards = gsap.utils.toArray<HTMLElement>(".story-card", section);
      const numbers = gsap.utils.toArray<HTMLElement>(".story-big b", section);
      section.classList.add("pinned");
      // The address types itself in as you scroll, so it starts empty.
      typed.textContent = "";
      // Each card starts collapsed into the bar, so it flies out from the scan.
      const origin = () => bar.getBoundingClientRect();
      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        scrollTrigger: { trigger: stage, start: "top top", end: "+=1700", pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true },
      });
      tl.fromTo(gsap.utils.toArray(".story-title .w", section), { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: 0.06, duration: 0.5 })
        .fromTo(bar, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4 }, "<0.2")
        .to(typed, { duration: 0.9, scrambleText: { text: "your-competitor.com", chars: "lowerCase", revealDelay: 0.2 }, ease: "none" })
        .fromTo(section.querySelector(".story-pulse"), { scale: 1, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.5, ease: "power1.out" })
        .fromTo(cards, {
          x: (index, card: HTMLElement) => { const o = origin(); const r = card.getBoundingClientRect(); return o.left + o.width / 2 - (r.left + r.width / 2); },
          y: (index, card: HTMLElement) => { const o = origin(); const r = card.getBoundingClientRect(); return o.top + o.height / 2 - (r.top + r.height / 2); },
          scale: 0.2, opacity: 0, rotate: (index) => (index % 2 ? 8 : -8),
        }, { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0, duration: 1.1, stagger: 0.12, ease: "expo.out" }, "<0.1")
        .fromTo(numbers, { textContent: 0 }, { textContent: (_index: number, el: HTMLElement) => Number(el.dataset.to), snap: { textContent: 1 }, duration: 0.9, stagger: 0.1 }, "<0.4")
        .to({}, { duration: 0.4 });
      return () => { section.classList.remove("pinned"); typed.textContent = "your-competitor.com"; };
    });
    return () => mm.revert();
  }, []);

  return (
    <section ref={root} className="story" aria-labelledby="story-title">
      <div className="story-stage">
        <p className="eyebrow">How it works</p>
        <h2 id="story-title" className="story-title">
          {["One", "address", "in."].map((word) => <span className="wm" key={word}><span className="w">{word}</span></span>)}{" "}
          {["Everything", "out."].map((word) => <span className="wm" key={word}><span className="w grad">{word}</span></span>)}
        </h2>
        <div className="story-bar">
          <span className="story-pulse" aria-hidden="true" />
          <Icon name="language" />
          <span className="story-typed mono">your-competitor.com</span>
          <span className="story-go" aria-hidden="true"><Icon name="arrow_forward" /></span>
        </div>
        <div className="story-cards">
          {REPORTS.map((report) => (
            <article className="story-card" key={report.key} style={{ ["--tone" as string]: report.tone }}>
              <header><span className="story-card-icon"><Icon name={report.icon} fill /></span><span>{report.label}</span></header>
              <p className="story-big"><b data-to={report.big}>{report.big}</b><small>{report.unit}</small></p>
              <ul>{report.lines.map((line) => <li key={line}>{line}</li>)}</ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
