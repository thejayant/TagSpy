"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);
/**
 * TagSpy's motion layer: one engine for every page, driven by the classes the pages already use.
 *
 * - Hero intro (CSS, `html.intro` in globals.css): the headline leads, the rest follows. CSS starts the moment a hero is
 *   painted, on the first load and after navigations, without waiting for React to hydrate.
 * - Reveals: blocks added to <main> later (reports stream in after a scan) and blocks below the fold rise in as they
 *   enter the viewport, once. New nodes are hidden in the MutationObserver callback, which runs before the browser
 *   paints, so nothing flickers.
 * - Count-ups: stat numbers count up from zero when revealed; score rings draw their arc.
 * - Magnetic primary buttons on precise pointers.
 *
 * Everything respects prefers-reduced-motion (the page simply appears), and pages with their own choreography (the
 * AI Website Detector, `.aid`) are left alone.
 */

/** Blocks that rise into view. Ordered from outer to inner: a block inside one already animating is skipped. */
const REVEAL = [
  ".score-card", ".tiles > .tile", ".group", ".related", ".note", ".insights > *", ".stack-cat", ".font-card", ".event-card",
  ".dest-card", ".watch-card", ".promo", ".unblock", ".paste", ".alert-card", ".table-wrap", ".guide-head", ".guide-card",
  ".guide-step", ".guide-faq details", ".guide-links a", ".home-tool", ".home-proof > *", ".story-card", ".mq", ".support-nudge", ".support-section",
].join(", ");
const COUNT = ".tile strong, .score-ring strong, [data-countup]";
const SKIP = ".aid, .sheet, .sheet-backdrop, .inspector, .story.pinned, [data-motion='off']";
/** Glass cards that catch a soft light where the cursor is. */
const GLOW = ".home-tool, .guide-card, .guide-step, .guide-links a, .story-card, .tile";
const MAGNETS = ".spotlight .go, .btn-primary.btn-lg, .home-cta .btn";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts a number up in its own text node, and stops if React writes a new value meanwhile. */
function countUp(el: Element) {
  const node = el.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE || el.childNodes.length !== 1) return;
  const original = node.nodeValue ?? "";
  if (!/^\d[\d,]*$/.test(original.trim())) return;
  const target = Number(original.replace(/,/g, ""));
  if (target < 2) return;
  const grouped = original.includes(",");
  const state = { v: 0 };
  let written = "0";
  node.nodeValue = written;
  gsap.to(state, {
    v: target, duration: Math.min(1.6, 0.6 + Math.log10(target + 1) * 0.35), ease: "power3.out",
    onUpdate() {
      if (node.nodeValue !== written) { this.kill(); return; }
      const value = Math.round(state.v);
      written = grouped ? value.toLocaleString("en-US") : String(value);
      node.nodeValue = written;
    },
    onComplete() { if (node.nodeValue === written) node.nodeValue = original; },
  });
}

/** Score rings: the arc draws from empty to its value. */
function drawRing(el: Element) {
  const fill = el.querySelector<SVGCircleElement>("circle.fill");
  const dash = fill?.getAttribute("stroke-dasharray");
  if (!fill || !dash) return;
  const [length, gap] = dash.split(/\s+/);
  gsap.fromTo(fill, { attr: { "stroke-dasharray": `0 ${gap}` } }, { attr: { "stroke-dasharray": `${length} ${gap}` }, duration: 1.6, ease: "expo.out", delay: 0.15 });
}

/** Animations that play when a block is revealed. */
function flourish(block: Element) {
  const counters = block.matches(COUNT) ? [block] : Array.from(block.querySelectorAll(COUNT));
  counters.forEach(countUp);
  (block.matches(".score-ring") ? [block] : Array.from(block.querySelectorAll(".score-ring"))).forEach(drawRing);
}

export function MotionRoot() {
  const path = usePathname();

  // ── Reveals and count-ups ──
  useEffect(() => {
    if (reduced()) return;
    const main = document.querySelector("main");
    if (!main) return;
    const seen = new WeakSet<Element>();
    const moving = new WeakSet<Element>();
    const pending: Element[] = [];
    // Only this engine's triggers are cleaned up; pages keep their own.
    const triggers: ScrollTrigger[] = [];

    const reveal = (targets: Element[]) => {
      if (!targets.length) return;
      gsap.set(targets, { opacity: 0, y: 28 });
      targets.forEach((target) => moving.add(target));
      triggers.push(...ScrollTrigger.batch(targets, {
        start: "top 94%",
        once: true,
        onEnter: (batch) => gsap.to(batch, {
          opacity: 1, y: 0, duration: 0.85, ease: "expo.out", stagger: { each: 0.06, amount: Math.min(0.5, batch.length * 0.06) }, overwrite: true, clearProps: "transform,opacity",
          onStart: () => batch.forEach(flourish),
          onComplete: () => batch.forEach((item) => moving.delete(item)),
        }),
      }));
    };

    /** Revealable blocks under `root` that aren't inside a block already moving (the outer block carries them). */
    const collect = (roots: Element[], belowFoldOnly: boolean) => {
      const found: Element[] = [];
      const fold = window.innerHeight * 0.92;
      for (const root of roots) {
        const candidates = [...(root.matches(REVEAL) ? [root] : []), ...Array.from(root.querySelectorAll(REVEAL))];
        for (const el of candidates) {
          if (seen.has(el) || el.closest(SKIP)) continue;
          let parent = el.parentElement;
          let covered = false;
          while (parent && parent !== main) { if (moving.has(parent) || found.includes(parent)) { covered = true; break; } parent = parent.parentElement; }
          if (covered) continue;
          if (belowFoldOnly && el.getBoundingClientRect().top < fold) { seen.add(el); continue; }
          seen.add(el);
          found.push(el);
        }
      }
      return found;
    };

    // Server-rendered blocks below the fold (guides, FAQs) reveal as you scroll; those already visible stay put.
    reveal(collect([main], true));

    // Blocks that arrive later (reports after a scan) start hidden before the browser paints them.
    const observer = new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach((node) => { if (node instanceof Element) pending.push(node); });
      if (!pending.length) return;
      const roots = pending.splice(0);
      reveal(collect(roots, false));
      // New content moves everything below it; re-measure the pending triggers.
      requestAnimationFrame(() => ScrollTrigger.refresh());
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => { observer.disconnect(); triggers.forEach((trigger) => trigger.kill()); };
  }, [path]);

  // ── Magnetic buttons (mouse and pen only) ──
  useEffect(() => {
    if (reduced() || !window.matchMedia("(pointer: fine)").matches) return;
    const movers = new WeakMap<HTMLElement, { x: gsap.QuickToFunc; y: gsap.QuickToFunc }>();
    let active: HTMLElement | null = null;
    const mover = (el: HTMLElement) => {
      let entry = movers.get(el);
      if (!entry) { gsap.set(el, { "--mx": "0px", "--my": "0px" }); entry = { x: gsap.quickTo(el, "--mx", { duration: 0.5, ease: "power3.out", unit: "px" }), y: gsap.quickTo(el, "--my", { duration: 0.5, ease: "power3.out", unit: "px" }) }; movers.set(el, entry); }
      return entry;
    };
    const onMove = (event: PointerEvent) => {
      const lit = (event.target as Element | null)?.closest<HTMLElement>(GLOW);
      if (lit) { const box = lit.getBoundingClientRect(); lit.style.setProperty("--gx", `${event.clientX - box.left}px`); lit.style.setProperty("--gy", `${event.clientY - box.top}px`); }
      const el = (event.target as Element | null)?.closest<HTMLElement>(MAGNETS) ?? null;
      if (active && active !== el) { const back = mover(active); back.x(0); back.y(0); }
      active = el;
      if (!el || (el as HTMLButtonElement).disabled) return;
      const box = el.getBoundingClientRect();
      const { x, y } = mover(el);
      x(gsap.utils.clamp(-6, 6, (event.clientX - (box.left + box.width / 2)) * 0.22));
      y(gsap.utils.clamp(-5, 5, (event.clientY - (box.top + box.height / 2)) * 0.3));
    };
    const onLeave = () => { if (active) { const back = mover(active); back.x(0); back.y(0); active = null; } };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave); };
  }, []);

  return null;
}
