"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DETECTS, FAQ, HOW_IT_WORKS, TIER_INFO } from "@/lib/ai/content";
import { AI_TOOLS } from "@/lib/ai/signatures";
import type { AiEvidence, AiReport, AiTier, AiTool, AiToolId } from "@/lib/ai/types";
import { SUPPORT_URL } from "@/lib/features";
import { Icon, SiteFooter, SiteHeader } from "./chrome";
import { ToolLinks } from "./seo-guide";
import { CoffeeButton } from "./support";
import { useToast } from "./toast";

if (typeof window !== "undefined") gsap.registerPlugin(useGSAP, SplitText, ScrambleTextPlugin, ScrollTrigger);
type Stage = "code" | "render" | "history" | "match" | "verdict";
type StageState = { state: "pending" | "active" | "done"; detail?: string };
interface Status { enabled: boolean; reason: string | null; perUser: number; remaining: number }
interface Check {
  status: "idle" | "running" | "done" | "error";
  stages: Record<Stage, StageState>;
  log: string;
  report: AiReport | null;
  error: string;
  startedAt: number;
}

const STAGES: { id: Stage; label: string; icon: string }[] = [
  { id: "code", label: "Reading the code", icon: "code" },
  { id: "render", label: "Running it in a real browser", icon: "travel_explore" },
  { id: "history", label: "Looking for agent files and history", icon: "history" },
  { id: "match", label: "Matching AI fingerprints", icon: "fingerprint" },
  { id: "verdict", label: "Weighing the evidence", icon: "balance" },
];
const FRESH_STAGES = (): Record<Stage, StageState> => ({ code: { state: "pending" }, render: { state: "pending" }, history: { state: "pending" }, match: { state: "pending" }, verdict: { state: "pending" } });
const IDLE: Check = { status: "idle", stages: FRESH_STAGES(), log: "", report: null, error: "", startedAt: 0 };
/** The one free result survives reloads of this tab (the tab's own storage; nothing on the server). */
const STORE = "tagspy:ai-report";

const VERDICT: Record<AiReport["verdict"], { title: string; tone: string }> = {
  "very-likely": { title: "Very likely built with AI", tone: "hot" },
  likely: { title: "Likely built with AI", tone: "warm" },
  possible: { title: "Possibly AI-assisted", tone: "mild" },
  unlikely: { title: "No clear AI footprints", tone: "cool" },
};
const CONFIDENCE: Record<AiReport["confidence"], { label: string; hint: string }> = {
  high: { label: "High confidence", hint: "Strong, specific evidence, or a full read of the site with clear evidence against AI." },
  medium: { label: "Medium confidence", hint: "Several clues point the same way, but none names a tool outright." },
  low: { label: "Low confidence", hint: "Only weak clues, or we could not read enough of the site." },
};
const ROTATE = ["Lovable", "Bolt", "v0", "Replit Agent", "Claude Code", "Cursor", "Codex", "Base44", "Emergent", "Copilot"];
const OUTER: AiToolId[] = ["lovable", "bolt", "v0", "replit", "ai-studio", "base44", "emergent"];
const INNER: AiToolId[] = ["claude-code", "codex", "cursor", "windsurf", "copilot", "gemini"];

/** Streams the AI check (NDJSON: stage, log, result, error) and keeps its state. */
function useAiCheck() {
  const [check, setCheck] = useState<Check>(IDLE);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setCheck({ ...IDLE, status: "done", report: JSON.parse(saved) as AiReport, stages: Object.fromEntries(STAGES.map((stage) => [stage.id, { state: "done" }])) as Record<Stage, StageState> });
    } catch { /* storage unavailable */ }
    return () => abort.current?.abort();
  }, []);

  const run = useCallback(async (url: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setCheck({ ...IDLE, status: "running", startedAt: Date.now(), log: "Starting" });
    try {
      const response = await fetch("/api/ai-detector", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), signal: controller.signal });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "stage") setCheck((current) => ({ ...current, stages: { ...current.stages, [event.stage]: { state: event.state, detail: event.detail ?? current.stages[event.stage as Stage]?.detail } } }));
          else if (event.type === "log") setCheck((current) => ({ ...current, log: event.text }));
          else if (event.type === "error") setCheck((current) => ({ ...current, status: "error", error: event.message }));
          else if (event.type === "result") {
            try { sessionStorage.setItem(STORE, JSON.stringify(event.model)); } catch { /* storage full or blocked */ }
            setCheck((current) => ({ ...current, status: "done", report: event.model }));
          }
        }
      }
      setCheck((current) => (current.status === "running" ? { ...current, status: "error", error: "The connection closed before the report was ready." } : current));
    } catch (error) {
      if (controller.signal.aborted) return;
      setCheck((current) => ({ ...current, status: "error", error: error instanceof Error ? error.message : "Request failed" }));
    }
  }, []);

  /** Cancelling stops the server's browser too; a cancelled check doesn't use up the free run. */
  const cancel = useCallback(() => { abort.current?.abort(); setCheck(IDLE); }, []);
  return { check, run, cancel };
}

function ToolMark({ tool, size = "md" }: { tool: AiTool; size?: "xs" | "md" | "lg" }) {
  const cls = `aid-mark ${size}`;
  if (tool.icon) {
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG; next/image adds nothing here
    return <span className={cls} title={tool.name}><img src={`/ai-icons/${tool.icon}`} alt="" decoding="async" /></span>;
  }
  if (tool.id === "assistant") return <span className={`${cls} letter`} style={{ ["--tone" as string]: tool.color }} title={tool.name}><Icon name="smart_toy" fill /></span>;
  return <span className={`${cls} letter`} style={{ ["--tone" as string]: tool.color }} title={tool.name}>{tool.name[0]}</span>;
}

/** The scanner: a glass lens with a radar sweep and AI tools circling on two orbits. */
function Lens({ mode, found }: { mode: "idle" | "scanning"; found: number }) {
  const root = useRef<HTMLDivElement>(null);
  const sweep = useRef<gsap.core.Tween | null>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.set(".aid-orbit", { "--spin": "0deg" });
      gsap.to(".aid-orbit.o1", { "--spin": "360deg", duration: 70, ease: "none", repeat: -1 });
      gsap.to(".aid-orbit.o2", { "--spin": "-360deg", duration: 48, ease: "none", repeat: -1 });
      sweep.current = gsap.to(".aid-sweep", { rotation: 360, duration: 6, ease: "none", repeat: -1 });
      // The marks, not the tiles: a tile's transform places it on the orbit and must stay CSS-driven.
      gsap.from(".aid-tile .aid-mark", { scale: 0, opacity: 0, duration: 0.8, ease: "back.out(2)", stagger: { each: 0.05, from: "random" }, delay: 0.2 });
      gsap.from(".aid-ring", { scale: 0.6, opacity: 0, duration: 1.2, ease: "expo.out", stagger: 0.12 });
    });
    return () => mm.revert();
  }, { scope: root });

  // Scanning speeds the sweep up and makes the tiles flicker as if each fingerprint is being tried.
  useGSAP(() => {
    if (!sweep.current) return;
    gsap.to(sweep.current, { timeScale: mode === "scanning" ? 4.5 : 1, duration: 1.2, ease: "power2.inOut" });
    if (mode !== "scanning") { gsap.to(".aid-tile", { opacity: 1, duration: 0.4, overwrite: "auto" }); return; }
    const tiles = gsap.utils.toArray<HTMLElement>(".aid-tile");
    const flicker = gsap.timeline({ repeat: -1 });
    flicker.to(tiles, { opacity: 0.35, duration: 0.25, stagger: { each: 0.12, from: "random", repeat: 1, yoyo: true } });
    return () => { flicker.kill(); };
  }, { scope: root, dependencies: [mode] });

  return (
    <div ref={root} className={`aid-lens ${mode}`} aria-hidden="true">
      <div className="aid-ring r1" /><div className="aid-ring r2" /><div className="aid-ring r3" />
      <div className="aid-sweep" />
      <div className="aid-orbit o1">
        {OUTER.map((id, index) => <div key={id} className="aid-tile" style={{ ["--a" as string]: `${(360 / OUTER.length) * index}deg` }}><ToolMark tool={AI_TOOLS[id]} /></div>)}
      </div>
      <div className="aid-orbit o2">
        {INNER.map((id, index) => <div key={id} className="aid-tile" style={{ ["--a" as string]: `${(360 / INNER.length) * index + 30}deg` }}><ToolMark tool={AI_TOOLS[id]} size="xs" /></div>)}
      </div>
      <div className="aid-core">
        <span className="aid-core-glow" />
        {mode === "scanning" ? <span className="aid-core-count"><strong>{found}/{STAGES.length}</strong><small>checks</small></span> : <Icon name="neurology" fill className="aid-core-icon" />}
      </div>
    </div>
  );
}

function Intro({ value, onChange, onSubmit, status, disabled }: { value: string; onChange: (value: string) => void; onSubmit: () => void; status: Status | null; disabled: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // The intro itself is CSS (html.intro), so the headline appears first, from the first paint. Here: the rotating
      // tool name, each one scrambling into the next.
      const names = gsap.timeline({ repeat: -1, delay: 1.6 });
      ROTATE.forEach((name) => names.to(".aid-rotor", { duration: 0.9, scrambleText: { text: name, chars: "lowerCase", speed: 0.6 }, ease: "none" }).to({}, { duration: 1.5 }));
    });
    return () => mm.revert();
  }, { scope: root });

  const used = status !== null && status.remaining <= 0;
  return (
    <div ref={root} className="aid-intro">
      <p className="eyebrow">AI Website Detector</p>
      <h1 className="aid-h1">Was this website built <span className="aid-grad">with AI?</span></h1>
      <p className="aid-sub">Finds the fingerprints <span className="aid-rotor">Lovable</span> leaves in a site&rsquo;s code, then tells you how likely it is that AI built it, and shows every clue.</p>
      <form className="spotlight aid-form" onSubmit={(event) => { event.preventDefault(); if (!disabled && value.trim()) onSubmit(); }}>
        <Icon name="language" />
        <label className="visually-hidden" htmlFor="aid-url">Website address</label>
        <input id="aid-url" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Enter any website, e.g. example.com" autoComplete="off" spellCheck={false} disabled={used} />
        <button className="go aid-go" disabled={disabled || used || !value.trim()} aria-label="Check this website"><Icon name="arrow_forward" /></button>
      </form>
      <div className="aid-quota">
        {status && !status.enabled ? <span className="chip chip-warn"><Icon name="block" /> {status.reason ?? "The AI check is off on this server."}</span>
          : used ? <><span className="chip"><Icon name="check_circle" /> Free check used</span><a className="text-btn" href={SUPPORT_URL} target="_blank" rel="noopener">Support TagSpy to raise the limit <Icon name="north_east" className="xs" /></a></>
          : <><span className="chip chip-ok"><Icon name="bolt" fill /> {status ? `${status.remaining} free check` : "1 free check"}</span><span className="faint small">Runs a real browser · about 20–40 s · nothing is stored</span></>}
      </div>
    </div>
  );
}

function ScanPanel({ check, host, onCancel }: { check: Check; host: string; onCancel: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.floor((now - check.startedAt) / 1000));
  const done = STAGES.filter((stage) => check.stages[stage.id].state === "done").length;
  // Progress eases toward 92% with time and jumps with each finished stage.
  const progress = Math.min(97, done * 16 + Math.min(20, seconds * 0.9));
  useGSAP(() => {
    gsap.from(".aid-scan > *", { y: 16, opacity: 0, duration: 0.6, stagger: 0.05, ease: "power3.out" });
  }, { scope: root });
  return (
    <div ref={root} className="aid-scan" aria-live="polite">
      <div className="aid-scan-head">
        <span className="aid-scan-host"><span className="aid-live" /> Checking <strong>{host}</strong></span>
        <time className="mono">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</time>
      </div>
      <div className="aid-bar"><div style={{ width: `${progress}%` }} /></div>
      <ol className="aid-stages">
        {STAGES.map((stage) => {
          const state = check.stages[stage.id];
          return (
            <li key={stage.id} className={`aid-stage ${state.state}`}>
              <span className="aid-stage-icon">{state.state === "done" ? <Icon name="check" /> : state.state === "active" ? <span className="spinner" /> : <Icon name={stage.icon} className="sm" />}</span>
              <span className="aid-stage-text"><strong>{stage.label}</strong>{state.detail && <small>{state.detail}</small>}</span>
            </li>
          );
        })}
      </ol>
      <div className="aid-scan-foot">
        <span className="faint small aid-ticker">{check.log}</span>
        <button type="button" className="text-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const strength = (ratio: number) => Math.max(1, Math.min(5, Math.round((Math.log(ratio) / Math.log(60)) * 5 + 0.5)));

function EvidenceItem({ item }: { item: AiEvidence }) {
  const against = item.ratio < 1;
  const bars = against ? Math.max(1, Math.min(5, Math.round(Math.abs(Math.log(item.ratio)) / Math.log(4) * 3))) : strength(item.ratio);
  const tool = item.tool ? AI_TOOLS[item.tool] : null;
  return (
    <li className={`aid-ev ${against ? "against" : ""}`}>
      <div className="aid-ev-head">
        <span className="aid-meter" title={`Strength ${bars} of 5`} aria-label={`Strength ${bars} of 5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= bars ? "on" : ""} />)}</span>
        <strong>{item.title}</strong>
        {tool && <span className="aid-ev-tool"><ToolMark tool={tool} size="xs" />{tool.name}</span>}
      </div>
      <p className="aid-ev-why">{item.why}</p>
      <div className="aid-ev-where"><span className="chip mono">{item.where}</span></div>
      <code className="aid-ev-snippet">{item.snippet}</code>
    </li>
  );
}

function Gauge({ value, tone }: { value: number; tone: string }) {
  const root = useRef<HTMLDivElement>(null);
  const number = useRef<HTMLSpanElement>(null);
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  useGSAP(() => {
    const arc = root.current!.querySelector<SVGCircleElement>(".aid-arc")!;
    const counter = { v: 0 };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = circumference * (1 - value / 100);
    if (reduce) { gsap.set(arc, { strokeDashoffset: target }); number.current!.textContent = String(value); return; }
    gsap.set(arc, { strokeDashoffset: circumference });
    gsap.timeline({ delay: 0.35 })
      .to(arc, { strokeDashoffset: target, duration: 2.2, ease: "expo.out" })
      .to(counter, { v: value, duration: 2.2, ease: "expo.out", onUpdate: () => { if (number.current) number.current.textContent = String(Math.round(counter.v)); } }, "<")
      .from(".aid-gauge-ticks line", { opacity: 0, duration: 0.02, stagger: 0.012 }, "<");
  }, { scope: root, dependencies: [value] });
  return (
    <div ref={root} className={`aid-gauge ${tone}`}>
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <defs>
          <linearGradient id="aid-arc-grad" x1="0" y1="0" x2="1" y2="1">
            {/* CSS variables only resolve in style, not in presentation attributes. */}
            <stop offset="0%" style={{ stopColor: "var(--aid-a)" }} />
            <stop offset="100%" style={{ stopColor: "var(--aid-b)" }} />
          </linearGradient>
        </defs>
        <g className="aid-gauge-ticks">
          {Array.from({ length: 60 }, (_, index) => { const angle = (index / 60) * Math.PI * 2; return <line key={index} x1={110 + Math.sin(angle) * 103} y1={110 - Math.cos(angle) * 103} x2={110 + Math.sin(angle) * (index % 5 ? 99 : 96)} y2={110 - Math.cos(angle) * (index % 5 ? 99 : 96)} />; })}
        </g>
        <circle className="aid-track" cx="110" cy="110" r={radius} />
        <circle className="aid-arc" cx="110" cy="110" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference} transform="rotate(-90 110 110)" />
      </svg>
      <div className="aid-gauge-value"><span ref={number}>0</span><small>%</small></div>
    </div>
  );
}

/** Starts a new check, or, when the free check is used, says so and points at the way to get more. */
function NewCheckButton({ locked, onNew, size = "lg" }: { locked: boolean; onNew: () => void; size?: "lg" | "md" }) {
  return (
    <button type="button" className={`btn btn-primary aid-new ${size === "lg" ? "btn-lg" : ""}`} onClick={onNew} title={locked ? "You've used your free check" : "Check another website"}>
      <Icon name={locked ? "lock" : "add"} /> {size === "lg" ? "Check another website" : "New check"}
    </button>
  );
}

function Dossier({ report, status, onNew }: { report: AiReport; status: Status | null; onNew: () => void }) {
  const locked = !!status && status.remaining <= 0;
  const root = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const verdict = VERDICT[report.verdict];
  const confidence = CONFIDENCE[report.confidence];
  const groups = useMemo(() => {
    const order: AiTier[] = ["named", "file", "template", "code", "content", "style", "against"];
    return order.map((tier) => ({ tier, items: report.evidence.filter((item) => item.tier === tier) })).filter((group) => group.items.length);
  }, [report.evidence]);
  const lead = report.tools[0];
  const signals = report.evidence.filter((item) => item.ratio > 1).length;

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const split = SplitText.create(".aid-verdict-title", { type: "words", mask: "words" });
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .from(".aid-dossier-top", { y: 30, opacity: 0, scale: 0.98, duration: 1 })
        .from(split.words, { yPercent: 115, duration: 1, stagger: 0.07 }, "<0.3")
        .from(".aid-verdict-meta > *", { y: 10, opacity: 0, duration: 0.6, stagger: 0.06 }, "<0.3")
        .from(".aid-tool", { y: 24, opacity: 0, duration: 0.8, stagger: 0.08 }, "<0.2")
        .from(".aid-share-fill", { scaleX: 0, transformOrigin: "left center", duration: 1.4, stagger: 0.08 }, "<0.2")
        .from(".aid-specimen", { clipPath: "inset(0 0 100% 0)", duration: 1.2, ease: "power4.inOut" }, 0.4);
      // Hidden up front, revealed on entering the viewport (a from-tween created on enter would flash the card first).
      gsap.set(".aid-ev, .aid-group-head", { y: 26, opacity: 0 });
      ScrollTrigger.batch(".aid-ev, .aid-group-head", { start: "top 94%", once: true, onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.06, overwrite: true }) });
      return () => split.revert();
    });
    return () => mm.revert();
  }, { scope: root });

  const copy = async () => {
    const text = [
      `${report.host}: ${report.likelihood}% chance it was built with AI (${verdict.title.toLowerCase()}, ${confidence.label.toLowerCase()}).`,
      lead ? `Most likely: ${lead.tool.name}.` : "",
      ...report.evidence.filter((item) => item.ratio > 1).slice(0, 4).map((item) => `• ${item.title}`),
      `Checked with the TagSpy AI Website Detector: ${window.location.origin}/ai-website-detector`,
    ].filter(Boolean).join("\n");
    try { await navigator.clipboard.writeText(text); toast("Result copied", "Paste it anywhere to share what we found."); } catch { toast("Couldn't copy", "Your browser blocked clipboard access."); }
  };

  return (
    <div ref={root} className="aid-dossier">
      <div className="aid-dossier-bar">
        <p className="mono"><Icon name="task_alt" className="sm" /> Checked {report.host} · {new Date(report.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        <div className="aid-dossier-bar-actions">
          {locked && <span className="chip"><Icon name="check_circle" /> Free check used</span>}
          <NewCheckButton locked={locked} onNew={onNew} size="md" />
        </div>
      </div>
      <section className="aid-dossier-top glass">
        <div className="aid-verdict">
          <Gauge value={report.likelihood} tone={verdict.tone} />
          <div className="aid-verdict-body">
            <p className="aid-kicker mono">AI likelihood · {report.host}</p>
            <h2 className="aid-verdict-title">{verdict.title}</h2>
            <p className="aid-verdict-line"><strong>{report.likelihood}% chance</strong> this website was built with AI{lead && report.likelihood >= 30 ? <>, most likely with <strong>{lead.tool.name}</strong></> : null}.</p>
            <div className="aid-verdict-meta">
              <span className={`chip aid-conf ${report.confidence}`} title={confidence.hint}><Icon name={report.confidence === "high" ? "verified" : report.confidence === "medium" ? "radio_button_partial" : "help"} /> {confidence.label}</span>
              <span className="chip"><Icon name="fingerprint" /> {signals} AI signal{signals === 1 ? "" : "s"}</span>
              {report.evidence.some((item) => item.ratio < 1) && <span className="chip chip-ok"><Icon name="handyman" /> {report.evidence.filter((item) => item.ratio < 1).length} against</span>}
              <span className="chip"><Icon name="timer" /> {(report.durationMs / 1000).toFixed(1)} s</span>
            </div>
          </div>
        </div>
        {report.screenshot && (
          <figure className="aid-specimen">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI screenshot from the scan */}
            <img src={report.screenshot} alt={`${report.host} as our browser saw it`} />
            <span className="aid-scanline" aria-hidden="true" />
            <figcaption className="mono">{report.finalUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</figcaption>
          </figure>
        )}
      </section>

      {report.tools.length > 0 && (
        <section>
          <h3 className="group-title">Most likely made with</h3>
          <div className="aid-tools">
            {report.tools.map((item) => (
              <article className="aid-tool glass" key={item.tool.id}>
                <ToolMark tool={item.tool} size="lg" />
                <div className="aid-tool-body">
                  <div className="aid-tool-name"><strong>{item.tool.name}</strong><span className="chip">{item.tool.kind}</span></div>
                  <div className="aid-share"><div className="aid-share-fill" style={{ width: `${Math.max(4, item.share)}%` }} /></div>
                  <small className="faint">{item.share}% of the evidence · strongest: {TIER_INFO[item.strongest].label.toLowerCase()}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="group-title">The evidence</h3>
        {groups.length === 0 ? (
          <div className="note aid-empty"><Icon name="search_off" /> We read the site and found no trace of an AI builder, agent files or typical AI-generated code. That doesn&rsquo;t prove it was written by hand: a careful developer using an AI assistant leaves nothing to find.</div>
        ) : groups.map((group) => (
          <div className={`aid-group ${group.tier}`} key={group.tier}>
            <div className="aid-group-head">
              <span className="aid-group-icon"><Icon name={TIER_INFO[group.tier].icon} fill /></span>
              <div><strong>{TIER_INFO[group.tier].label}</strong><small>{TIER_INFO[group.tier].blurb}</small></div>
              <span className="aid-group-count mono">{group.items.length}</span>
            </div>
            <ul className="aid-evidence">{group.items.map((item) => <EvidenceItem key={item.id} item={item} />)}</ul>
          </div>
        ))}
      </section>

      <section className="aid-coverage glass">
        <h3 className="group-title">What we read</h3>
        <ul>
          <li className={report.coverage.rendered ? "ok" : ""}><Icon name={report.coverage.rendered ? "check_circle" : "cancel"} fill /> {report.coverage.rendered ? "Rendered in a real browser" : "Could not render the page"}</li>
          <li><Icon name="javascript" /> {report.coverage.scripts} JavaScript file{report.coverage.scripts === 1 ? "" : "s"}</li>
          <li><Icon name="format_paint" /> {report.coverage.stylesheets} stylesheet{report.coverage.stylesheets === 1 ? "" : "s"}</li>
          <li><Icon name="map" /> {report.coverage.sourceMaps ? `${report.coverage.sourceMaps} public source map${report.coverage.sourceMaps === 1 ? "" : "s"}` : "No public source maps"}</li>
          <li><Icon name="article" /> {report.coverage.textChars.toLocaleString()} characters of page text</li>
          <li><Icon name="description" /> {report.coverage.agentFiles ? `${report.coverage.agentFiles} public agent file${report.coverage.agentFiles === 1 ? "" : "s"}` : "No public agent files"}</li>
          {report.coverage.repo && <li><Icon name="commit" /> github.com/{report.coverage.repo}</li>}
          <li><Icon name="history" /> {report.coverage.firstArchived ? `First archived ${report.coverage.firstArchived}` : "No archive history found"}</li>
        </ul>
        {report.stack.length > 0 && <div className="aid-stack"><span className="faint small">Stack:</span>{report.stack.map((item) => <span className="chip" key={item.name}>{item.name}</span>)}<Link className="text-btn small" href={`/site?url=${encodeURIComponent(report.host)}`}>Full Site DNA <Icon name="arrow_forward" className="xs" /></Link></div>}
        {report.notes.map((note) => <p className="aid-note small" key={note}><Icon name="info" className="sm" /> {note}</p>)}
      </section>

      <div className="note aid-disclaimer">
        <Icon name="balance" />
        <p><strong>Signals, not proof.</strong> This is a likelihood built from public evidence. AI builders are easy to spot when they sign their work; coding agents like Claude Code, Codex and Cursor leave nothing behind unless their files or commits are public, so a low score never proves a site was written by hand.</p>
      </div>

      <div className="aid-actions">
        <NewCheckButton locked={locked} onNew={onNew} />
        <button type="button" className="btn btn-lg" onClick={copy}><Icon name="content_copy" /> Copy result</button>
        <Link className="btn btn-lg" href={`/site?url=${encodeURIComponent(report.host)}`}><Icon name="travel_explore" /> See how it&rsquo;s built</Link>
      </div>
      {locked && <SupportCard />}
    </div>
  );
}

function SupportCard() {
  return (
    <aside className="aid-support glass" id="aid-support">
      <span className="aid-support-glyph"><Icon name="favorite" fill /></span>
      <div>
        <h3>Want to check another website?</h3>
        <p>You&rsquo;ve used your free check. Every check runs a real browser in the cloud, and that costs money, so each person gets one. A coffee pays for those browsers and helps raise the limit for everyone.</p>
      </div>
      <CoffeeButton size="lg" />
    </aside>
  );
}

function Guide() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.set(".aid-detect, .aid-how li", { y: 30, opacity: 0 });
      ScrollTrigger.batch(".aid-detect, .aid-how li", { start: "top 94%", once: true, onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 0.8, ease: "expo.out", stagger: 0.05, overwrite: true }) });
    });
    return () => mm.revert();
  }, { scope: root });
  return (
    <div ref={root} className="aid-guide">
      <section>
        <h2 className="aid-h2">What it can detect</h2>
        <p className="aid-lede">AI builders sign their work in many small ways. Coding agents are caught through the files and commits they leave in public.</p>
        <div className="aid-detects">
          {DETECTS.map((item) => (
            <div className="aid-detect glass" key={item.id}>
              <ToolMark tool={AI_TOOLS[item.id]} />
              <div><strong>{AI_TOOLS[item.id].name}</strong><small>{item.line}</small></div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="aid-h2">How the AI website checker works</h2>
        <ol className="aid-how">
          {HOW_IT_WORKS.map((step, index) => (
            <li className="glass" key={step.title}>
              <span className="aid-how-num mono">0{index + 1}</span>
              <Icon name={step.icon} className="aid-how-icon" />
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2 className="aid-h2">Questions</h2>
        <div className="aid-faq">
          {FAQ.map((item) => (
            <details key={item.q} className="glass">
              <summary>{item.q}<Icon name="add" className="aid-faq-icon" /></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
      <ToolLinks slug="ai" />
    </div>
  );
}

const hostOf = (value: string) => { try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname; } catch { return value; } };

export function AiDetectorApp({ initialUrl }: { initialUrl?: string }) {
  const [value, setValue] = useState(initialUrl ?? "");
  const [status, setStatus] = useState<Status | null>(null);
  const { check, run, cancel } = useAiCheck();
  const heroRef = useRef<HTMLElement>(null);

  // How many free checks are left; re-read whenever a check ends.
  useEffect(() => {
    if (check.status === "running") return;
    let alive = true;
    fetch("/api/ai-detector", { cache: "no-store" }).then((response) => response.json()).then((body) => { if (alive) setStatus(body); }).catch(() => {});
    return () => { alive = false; };
  }, [check.status]);

  const submit = () => { if (value.trim()) void run(value.trim()); };
  const toast = useToast();
  // A new check clears this result and puts the cursor in the address field. With the free check used, it keeps the
  // result (it can't be run again) and brings the support card into view instead.
  const newCheck = () => {
    if (status && status.remaining <= 0) {
      const card = document.getElementById("aid-support");
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (card && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.fromTo(card, { scale: 0.96 }, { scale: 1, duration: 0.9, ease: "elastic.out(1, 0.45)", delay: 0.35, clearProps: "transform" });
        card.classList.remove("nudge");
        void card.offsetWidth;
        card.classList.add("nudge");
      }
      toast("You've used your free check", "Support TagSpy to help raise the limit.");
      return;
    }
    try { sessionStorage.removeItem(STORE); } catch { /* ignore */ }
    cancel();
    setValue("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => document.getElementById("aid-url")?.focus({ preventScroll: true }), 450);
  };
  const done = check.status === "done" && check.report;
  const found = STAGES.filter((stage) => check.stages[stage.id].state === "done").length;

  return (
    <>
      <SiteHeader />
      <main className="aid">
        {!done && (
          <section ref={heroRef} className={`aid-hero ${check.status === "running" ? "scanning" : ""}`}>
            {check.status === "running" ? <ScanPanel check={check} host={hostOf(value)} onCancel={cancel} /> : <Intro value={value} onChange={setValue} onSubmit={submit} status={status} disabled={check.status !== "idle" && check.status !== "error"} />}
            <Lens mode={check.status === "running" ? "scanning" : "idle"} found={found} />
          </section>
        )}
        {check.status === "error" && (
          <div className="alert-card aid-error" role="alert"><Icon name="error" fill /><span>{check.error}</span></div>
        )}
        {status && status.remaining <= 0 && !done && check.status !== "running" && <SupportCard />}
        {done && check.report && <Dossier report={check.report} status={status} onNew={newCheck} />}
        <Guide />
      </main>
      <SiteFooter />
    </>
  );
}
