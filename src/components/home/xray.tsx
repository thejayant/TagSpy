"use client";

import { animate, createDrawable, createMotionPath, stagger, type JSAnimation } from "animejs";
import gsap from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { useEffect, useRef } from "react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrambleTextPlugin);

/**
 * The landing page's centrepiece: a website under an X-ray lens. The lens follows the pointer (or, left alone, tours
 * the page like a spy, element by element), and inside it the site's skin gives way to its skeleton: the markup, the
 * fonts, the scripts. Around it, what TagSpy finds flies out on wires with data flowing along them.
 *
 * Motion is split by strength: GSAP drives the lens and the 3D tilt (quickTo, smooth pointer following); anime.js
 * draws the wires and sends packets along them (createMotionPath) and keeps the findings floating; the findings' entrance
 * is CSS so it plays from the first paint. Everything pauses when the stage is off screen, and with reduced motion the
 * stage is a still picture.
 */

const SITES = ["northwind.design", "your-competitor.com", "acme.studio", "linear.app", "stripe.com"];

/** Findings around the frame, each wired to the element it was read from. */
const FINDINGS: { id: string; from: string; side: "left" | "right"; icon: string; title: string; detail: string; tone: string }[] = [
  { id: "gtm", from: "nav", side: "left", icon: "/tech-icons/google-tag-manager.svg", title: "GTM-N7Q4XK", detail: "38 tags · 9 destinations", tone: "#4f86ff" },
  { id: "ga4", from: "cta", side: "left", icon: "/tech-icons/google-analytics.svg", title: "GA4 · 14 events", detail: "3 key events · consent mode", tone: "#f9ab00" },
  { id: "meta", from: "cards", side: "left", icon: "/tech-icons/meta-pixel.svg", title: "Meta Pixel", detail: "6 codeless rules · CAPI", tone: "#1877f2" },
  { id: "stack", from: "art", side: "right", icon: "/tech-icons/nextjs.svg", title: "Next.js 16 · React 19", detail: "three.js r185 · GSAP 3.15", tone: "#8a8cff" },
  { id: "font", from: "h1", side: "right", icon: "", title: "Sora · Inter", detail: "Google Fonts · 5 weights", tone: "#45dcd8" },
  { id: "ai", from: "btns", side: "right", icon: "", title: "12% AI-built", detail: "Hand-built · high confidence", tone: "#3ee0a1" },
];

/** The fake website. Rendered twice with identical geometry: once as its skin, once as its X-ray. */
function Specimen({ xray = false }: { xray?: boolean }) {
  return (
    <div className="fp" aria-hidden="true">
      <div className="fp-nav" data-xr="<nav> · flex · 64px · sticky" data-part="nav">
        <span className="fp-logo" data-xr="<svg> logo · 28px"><i /></span>
        <span className="fp-links"><i /><i /><i /><i /></span>
        <span className="fp-cta" data-xr="<button> · #6D6BFF · r12" data-part="cta">Start</span>
      </div>
      <div className="fp-hero">
        <div className="fp-copy">
          <div className="fp-h1" data-xr="<h1> · Sora 600 · 64/1.02" data-part="h1">Design that<br />moves people</div>
          <div className="fp-p" data-xr="<p> · Inter 400 · 18/1.6"><i /><i /><i /></div>
          <div className="fp-btns" data-xr="<a> ×2 · gtag('event','cta_click')" data-part="btns"><span className="fp-btn a">Get started</span><span className="fp-btn b">Watch demo</span></div>
        </div>
        <div className="fp-art" data-xr="<canvas> · WebGL2 · 30 shaders" data-part="art"><span className="fp-orb one" /><span className="fp-orb two" /><span className="fp-orb three" /></div>
      </div>
      <div className="fp-cards" data-xr="grid · 3 cols · gap 24 · lazy" data-part="cards"><span><i /><i /></span><span><i /><i /></span><span><i /><i /></span></div>
      {xray && (
        <pre className="fp-code">{`<script src="gtm.js?id=GTM-N7Q4XK">
gtag('config', 'G-8QX2LM4TV1')
fbq('init', '574120938812')
import { gsap } from "gsap"
@font-face { font-family: "Sora" }`}</pre>
      )}
    </div>
  );
}

export function XrayStage() {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = root.querySelector<HTMLElement>(".xr-frame")!;
    const view = root.querySelector<HTMLElement>(".xr-view")!;
    const svg = root.querySelector<SVGSVGElement>(".xr-wires")!;
    const readout = root.querySelector<HTMLElement>(".xr-readout")!;
    const anims: JSAnimation[] = [];
    // Wires are rebuilt on resize, so they keep their own list.
    const wires: JSAnimation[] = [];
    const cleanups: (() => void)[] = [];

    // ── Wires: from the element a finding was read from to the finding's card, recomputed on resize ──
    const draw = (animateIn: boolean) => {
      wires.splice(0).forEach((item) => item.revert());
      const box = root.getBoundingClientRect();
      svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      svg.innerHTML = "";
      const visible = FINDINGS.filter((item) => getComputedStyle(root.querySelector(`[data-finding="${item.id}"]`)!).display !== "none");
      visible.forEach((finding, index) => {
        const card = root.querySelector<HTMLElement>(`[data-finding="${finding.id}"]`)!.getBoundingClientRect();
        const source = view.querySelector<HTMLElement>(`.xr-skin [data-part="${finding.from}"]`)!.getBoundingClientRect();
        const ax = source.left + source.width * (finding.side === "left" ? 0.2 : 0.8) - box.left;
        const ay = source.top + source.height / 2 - box.top;
        const cx = (finding.side === "left" ? card.right : card.left) - box.left;
        const cy = card.top + card.height / 2 - box.top;
        const bend = (cx - ax) * 0.55;
        const d = `M ${ax.toFixed(1)} ${ay.toFixed(1)} C ${(ax + bend).toFixed(1)} ${ay.toFixed(1)}, ${(cx - bend).toFixed(1)} ${cy.toFixed(1)}, ${cx.toFixed(1)} ${cy.toFixed(1)}`;
        const ns = "http://www.w3.org/2000/svg";
        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", d);
        path.setAttribute("class", "xr-wire");
        path.style.setProperty("--tone", finding.tone);
        const dot = document.createElementNS(ns, "circle");
        dot.setAttribute("r", "3");
        dot.setAttribute("class", "xr-packet");
        dot.style.setProperty("--tone", finding.tone);
        const pin = document.createElementNS(ns, "circle");
        pin.setAttribute("cx", ax.toFixed(1));
        pin.setAttribute("cy", ay.toFixed(1));
        pin.setAttribute("r", "3.5");
        pin.setAttribute("class", "xr-pin");
        pin.style.setProperty("--tone", finding.tone);
        svg.append(path, pin, dot);
        if (reduce) { dot.remove(); return; }
        const drawable = createDrawable(path);
        wires.push(animate(drawable, { draw: animateIn ? ["0 0", "0 1"] : ["0 1", "0 1"], duration: 900, delay: animateIn ? 900 + index * 140 : 0, ease: "inOutQuad" }));
        // Data flowing from the page to the finding, forever, each wire at its own pace.
        wires.push(animate(dot, { ...createMotionPath(path), duration: 1800 + index * 260, delay: (animateIn ? 1800 : 0) + index * 300, loop: true, ease: "inOutSine" }));
      });
    };

    // ── Findings: they spring in with CSS from the first paint (html.intro); anime.js keeps them floating ──
    requestAnimationFrame(() => draw(!reduce));
    const bob = reduce ? null : animate(root.querySelectorAll(".xr-finding-body"), { y: [0, -7], duration: 2600, delay: stagger(320, { start: 2200 }), loop: true, alternate: true, ease: "inOutSine" });
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => draw(false), 120); });
    observer.observe(root);
    cleanups.push(() => { observer.disconnect(); clearTimeout(resizeTimer); bob?.revert(); });

    if (reduce) {
      root.style.setProperty("--lx", "62%");
      root.style.setProperty("--ly", "38%");
      return () => { [...anims, ...wires].forEach((item) => item.revert()); cleanups.forEach((fn) => fn()); };
    }

    // ── The lens: follows the pointer, or tours the page when left alone ──
    const lx = gsap.quickTo(root, "--lx", { duration: 0.55, ease: "power3.out", unit: "%" });
    const ly = gsap.quickTo(root, "--ly", { duration: 0.55, ease: "power3.out", unit: "%" });
    gsap.set(root, { "--lx": "60%", "--ly": "34%" });
    const parts = Array.from(view.querySelectorAll<HTMLElement>(".xr-skin [data-xr]"));
    let lastLabel = "";
    // Labels contain markup like "<h1>", so they are scrambled as plain text (ScrambleText writes HTML).
    const GLYPHS = "01<>/{}#=";
    let decode: gsap.core.Tween | null = null;
    const scramble = (el: HTMLElement, target: string) => {
      decode?.kill();
      const state = { p: 0 };
      decode = gsap.to(state, { p: 1, duration: 0.45, ease: "power1.out", onUpdate: () => {
        const shown = Math.floor(target.length * state.p);
        el.textContent = target.slice(0, shown) + [...target.slice(shown)].map((char) => (char === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join("");
      } });
    };
    /** What sits under the lens: the smallest annotated element containing its centre. */
    const inspect = (px: number, py: number) => {
      let best: HTMLElement | null = null;
      let area = Infinity;
      for (const part of parts) {
        const rect = part.getBoundingClientRect();
        if (px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom && rect.width * rect.height < area) { best = part; area = rect.width * rect.height; }
      }
      const label = best?.dataset.xr ?? "<body> · 1280 × 800";
      if (label !== lastLabel) { lastLabel = label; scramble(readout, label); }
    };
    const moveTo = (px: number, py: number) => {
      const rect = view.getBoundingClientRect();
      lx(((px - rect.left) / rect.width) * 100);
      ly(((py - rect.top) / rect.height) * 100);
      inspect(px, py);
    };

    // The tour: the lens visits the headline, the artwork, the scripts in the nav, the cards and the buttons.
    const stops = ["h1", "art", "nav", "cards", "btns", "cta"];
    let tour: gsap.core.Timeline | null = null;
    const startTour = () => {
      tour?.kill();
      tour = gsap.timeline({ repeat: -1 });
      for (const stop of stops) {
        tour.add(() => {
          const rect = view.querySelector<HTMLElement>(`.xr-skin [data-part="${stop}"]`)!.getBoundingClientRect();
          moveTo(rect.left + rect.width * (0.35 + Math.random() * 0.3), rect.top + rect.height * 0.5);
        }).to({}, { duration: 1.9 });
      }
    };
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      tour?.kill(); tour = null;
      root.classList.add("hands-on");
      moveTo(event.clientX, event.clientY);
      clearTimeout(idle);
      idle = setTimeout(() => { root.classList.remove("hands-on"); startTour(); }, 2200);
      // A gentle 3D tilt toward the pointer.
      const box = root.getBoundingClientRect();
      tiltX(((event.clientY - box.top) / box.height - 0.5) * -7);
      tiltY(((event.clientX - box.left) / box.width - 0.5) * 9);
    };
    const onLeave = () => { tiltX(0); tiltY(0); };
    const tiltX = gsap.quickTo(frame, "rotationX", { duration: 0.8, ease: "power3.out" });
    const tiltY = gsap.quickTo(frame, "rotationY", { duration: 0.8, ease: "power3.out" });
    const hero = root.closest("section") ?? root;
    hero.addEventListener("pointermove", onMove as EventListener);
    hero.addEventListener("pointerleave", onLeave);
    startTour();

    // The address bar cycles through sites, each scrambling into the next.
    const url = root.querySelector<HTMLElement>(".xr-url-text")!;
    const urls = gsap.timeline({ repeat: -1, delay: 2.5 });
    SITES.slice(1).concat(SITES[0]).forEach((site) => urls.to(url, { duration: 0.9, scrambleText: { text: site, chars: "lowerCase", speed: 0.7 } }).to({}, { duration: 3.2 }));

    // Nothing runs while the stage is off screen.
    const visibility = new IntersectionObserver(([entry]) => {
      const on = entry.isIntersecting;
      [...anims, ...wires].forEach((item) => (on ? item.resume() : item.pause()));
      if (on) { bob?.resume(); urls.resume(); tour?.resume(); } else { bob?.pause(); urls.pause(); tour?.pause(); }
    });
    visibility.observe(root);

    return () => {
      hero.removeEventListener("pointermove", onMove as EventListener);
      hero.removeEventListener("pointerleave", onLeave);
      clearTimeout(idle);
      visibility.disconnect();
      tour?.kill(); urls.kill();
      [...anims, ...wires].forEach((item) => item.revert());
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return (
    <div ref={stage} className="xr" aria-hidden="true">
      <svg className="xr-wires" />
      {FINDINGS.map((finding, index) => (
        <div key={finding.id} className={`xr-finding ${finding.side}`} data-finding={finding.id} style={{ ["--tone" as string]: finding.tone, ["--n" as string]: index }}>
          <span className="xr-finding-body">
            <span className="xr-finding-icon">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG marks */}
            {finding.icon ? <img src={finding.icon} alt="" /> : finding.id === "font" ? <b>Aa</b> : <b>AI</b>}
          </span>
          <span className="xr-finding-text"><strong>{finding.title}</strong><small>{finding.detail}</small></span>
          </span>
        </div>
      ))}
      <div className="xr-frame">
        <div className="xr-bar">
          <span className="xr-dots"><i /><i /><i /></span>
          <span className="xr-url"><span className="xr-lock">●</span><span className="xr-url-text">{SITES[0]}</span></span>
          <span className="xr-scan-tag mono">X-RAY</span>
        </div>
        <div className="xr-view">
          <div className="xr-skin"><Specimen /></div>
          <div className="xr-xray"><Specimen xray /></div>
          <div className="xr-lens"><span className="xr-cross" /><span className="xr-readout mono">&lt;h1&gt; · Sora 600 · 64/1.02</span></div>
        </div>
      </div>
    </div>
  );
}
