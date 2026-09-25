"use client";

import { useEffect, useState } from "react";
import { SUPPORT_URL } from "@/lib/features";

/**
 * Support for TagSpy through Buy Me a Coffee. A native button in the page's own style (Buy Me a Coffee's embed script
 * writes into the page with document.write, which React can't host, and would load third-party code on every visit).
 *
 * The ask appears where it earns its place: at the end of a result, the moment someone has just got value. It can
 * be put off for two weeks, and after someone clicks through it says thank you instead of asking again. Both choices
 * live only in this browser's localStorage.
 *
 * (This file must not import from ./chrome: the footer there uses CoffeeButton.)
 */

const SUPPORTED = "tagspy:supported";
const LATER = "tagspy:support-later";
const DAY = 86_400_000;

const read = (key: string) => { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } };
const write = (key: string) => { try { localStorage.setItem(key, String(Date.now())); } catch { /* storage blocked */ } };

/** The Buy Me a Coffee button: green, Cookie script, a yellow cup with rising steam. */
export function CoffeeButton({ size = "md", label = "Buy me a coffee" }: { size?: "sm" | "md" | "lg"; label?: string }) {
  return (
    <a className={`coffee ${size}`} href={SUPPORT_URL} target="_blank" rel="noopener" onClick={() => write(SUPPORTED)}>
      {/* A drawn cup in the page's coffee yellow (emoji render differently on every OS). */}
      <span className="coffee-cup" aria-hidden="true">
        <i /><i />
        <svg viewBox="0 0 24 24"><path d="M4 8h13v5.5A5.5 5.5 0 0 1 11.5 19h-2A5.5 5.5 0 0 1 4 13.5z" fill="#ffdd00" stroke="#000" strokeWidth="1.6" strokeLinejoin="round" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H16.6" fill="none" stroke="#000" strokeWidth="1.6" strokeLinecap="round" /><path d="M3 21.5h16" stroke="#000" strokeWidth="1.6" strokeLinecap="round" /><path d="M6.5 11.5h7" stroke="#fff" strokeOpacity=".7" strokeWidth="1.3" strokeLinecap="round" /></svg>
      </span>
      <span className="coffee-label">{label}</span>
    </a>
  );
}

type Tool = "ga4" | "gtm" | "meta" | "segment" | "site";
/** What the visitor just got, in their terms. */
const VALUE: Record<Tool, string> = {
  ga4: "That GA4 audit took seconds, not an afternoon of clicking through Admin.",
  gtm: "Rebuilding a container by hand takes hours. You just read every tag, trigger and variable in seconds.",
  meta: "Decoding a pixel's setup usually needs Events Manager access. You didn't need it.",
  segment: "You just mapped a whole customer data stack without a workspace login.",
  site: "Framework, fonts, colours and hosting, read in one go.",
};

/** The end-of-report ask. Rendered after a result, so only people who read to the end see it. */
export function SupportNudge({ tool }: { tool: Tool }) {
  const [state, setState] = useState<"hidden" | "ask" | "thanks">("hidden");

  useEffect(() => {
    const supported = read(SUPPORTED);
    const later = read(LATER);
    // Reading this browser's own choices once, after hydration (the server can't know them).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(supported && Date.now() - supported < 60 * DAY ? "thanks" : later && Date.now() - later < 14 * DAY ? "hidden" : "ask");
  }, []);

  if (state === "hidden") return null;
  if (state === "thanks") {
    return <p className="support-thanks"><span aria-hidden="true">☕</span> Thanks for supporting TagSpy. It keeps every tool here free.</p>;
  }
  return (
    <aside className="support-nudge" aria-label="Support TagSpy">
      <div className="support-copy">
        <strong>Did TagSpy save you time?</strong>
        <p>{VALUE[tool]} TagSpy is free, has no ads and is built by one person. A coffee keeps it that way.</p>
      </div>
      <div className="support-actions">
        <CoffeeButton />
        <button type="button" className="text-btn" onClick={() => { write(LATER); setState("hidden"); }}>Maybe later</button>
      </div>
    </aside>
  );
}

/** Landing page: what a coffee pays for. */
export function SupportSection() {
  return (
    <section className="support-section" aria-labelledby="support-title">
      <div className="support-section-copy">
        <p className="guide-kicker mono">Free &amp; independent</p>
        <h2 id="support-title">Keep TagSpy free for everyone</h2>
        <p>No ads, no accounts, nothing tracked. TagSpy is built and paid for by one person. If it saved you an afternoon, a coffee helps cover:</p>
        <ul>
          <li><span aria-hidden="true">🖥️</span> Servers and the database</li>
          <li><span aria-hidden="true">🧭</span> Real cloud browsers for every deep scan and AI check</li>
          <li><span aria-hidden="true">🔍</span> New detectors for the next wave of AI builders</li>
        </ul>
      </div>
      <div className="support-section-cta">
        <CoffeeButton size="lg" />
        <small>Takes a minute · no account needed</small>
      </div>
    </section>
  );
}
