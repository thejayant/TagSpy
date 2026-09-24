"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/compiled";
import { Icon } from "./chrome";

export type Mode = "ga4" | "gtm";
interface LogLine { text: string; level: "info" | "ok" | "warn" | "err"; at: string }
interface Found { id: string; kind: string; via: string }

export interface InspectState<T> {
  status: "idle" | "running" | "choices" | "done" | "error";
  logs: LogLine[];
  progress: number;
  choices: Found[];
  result: { id: string; model: T; changes: unknown[] } | null;
  error: string;
}

export function useInspect<T>(mode: Mode) {
  const [state, setState] = useState<InspectState<T>>({ status: "idle", logs: [], progress: 0, choices: [], result: null, error: "" });
  const abort = useRef<AbortController | null>(null);

  /** `input` is an ID or URL, or pasted page source when `options.source` is "html". */
  const run = useCallback(async (input: string, options: { fresh?: boolean; source?: "html" } = {}) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const stamp = () => new Date().toLocaleTimeString();
    const first = options.source === "html" ? "Reading the page source you pasted" : mode === "gtm" ? "Preparing to open the container" : "Preparing to read the Google tag";
    // The previous result stays visible while a refresh runs; it is cleared on error or when choices are offered.
    setState((current) => ({ status: "running", logs: [{ text: first, level: "info", at: stamp() }], progress: 8, choices: [], result: current.result, error: "" }));
    try {
      const response = await fetch("/api/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options.source === "html" ? { mode, html: input } : { mode, input, fresh: options.fresh }),
        signal: controller.signal,
      });
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
          if (event.type === "log") setState((current) => ({ ...current, logs: [...current.logs, { text: event.text, level: event.level ?? "info", at: stamp() }], progress: Math.min(90, current.progress + (100 - current.progress) * 0.28) }));
          else if (event.type === "choices") setState((current) => ({ ...current, status: "choices", choices: event.ids, result: null, progress: 100 }));
          else if (event.type === "error") setState((current) => ({ ...current, status: "error", result: null, error: event.message, logs: [...current.logs, { text: event.message, level: "err", at: stamp() }], progress: 100 }));
          else if (event.type === "result") setState((current) => ({ ...current, status: "done", result: { id: event.id, model: event.model, changes: event.changes }, logs: [...current.logs, { text: "Done", level: "ok", at: stamp() }], progress: 100 }));
        }
      }
      setState((current) => (current.status === "running" ? { ...current, status: "error", error: "The connection closed before the report was ready." } : current));
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((current) => ({ ...current, status: "error", result: null, error: error instanceof Error ? error.message : "Request failed", progress: 100 }));
    }
  }, [mode]);

  const cancel = useCallback(() => {
    abort.current?.abort();
    setState((current) => ({ ...current, status: "idle", progress: 0 }));
  }, []);

  const reset = useCallback(() => setState({ status: "idle", logs: [], progress: 0, choices: [], result: null, error: "" }), []);
  useEffect(() => () => abort.current?.abort(), []);
  return { state, run, cancel, reset };
}

const COPY: Record<Mode, { eyebrow: string; title: string; sub: string; placeholder: string }> = {
  ga4: {
    eyebrow: "Google Analytics 4",
    title: "See inside any GA4 setup.",
    sub: "Enter a Measurement ID or any website. We read the published Google tag and lay out every event, key event and privacy setting.",
    placeholder: "G-XXXXXXXXXX, GT-XXXXXXX or example.com",
  },
  gtm: {
    eyebrow: "Google Tag Manager",
    title: "Open any container.",
    sub: "Enter a container ID or any website. We rebuild its tags, triggers and variables — and let you export them.",
    placeholder: "GTM-XXXXXXX or example.com",
  },
};

export function ModeSwitch({ mode }: { mode: Mode }) {
  return (
    <nav className="segmented" aria-label="What to inspect">
      <Link href="/ga4" className={mode === "ga4" ? "on" : ""} aria-current={mode === "ga4" ? "page" : undefined}>GA4</Link>
      <Link href="/gtm" className={mode === "gtm" ? "on" : ""} aria-current={mode === "gtm" ? "page" : undefined}>Tag Manager</Link>
      <span aria-disabled="true" title="Firebase app inspection is not available yet">Apps <em>Soon</em></span>
    </nav>
  );
}

/** Drops the "enter the ID directly" hint from blocked-site errors; the blocked card below gives that advice. */
function shortError(text: string): string {
  const head = text.split(". Enter the container")[0];
  return head.endsWith(".") ? head : `${head}.`;
}

function Steps({ logs, running, progress, onCancel }: { logs: LogLine[]; running: boolean; progress: number; onCancel: () => void }) {
  const shown = logs.slice(-6);
  return (
    <div className="steps" aria-live="polite">
      <div className="steps-bar"><div style={{ width: `${progress}%` }} /></div>
      <ul>
        {shown.map((line, index) => {
          const last = index === shown.length - 1;
          const icon = line.level === "err" ? "error" : line.level === "warn" ? "info" : last && running ? null : "check_circle";
          return (
            <li key={`${line.at}-${index}`} className={`step-${line.level} ${last && running ? "active" : ""}`}>
              {icon ? <Icon name={icon} fill className="sm" /> : <span className="spinner" aria-hidden="true" />}
              <span>{line.level === "err" ? shortError(line.text) : line.text}</span>
              <time>{line.at}</time>
            </li>
          );
        })}
      </ul>
      {running && <button type="button" className="text-btn" onClick={onCancel}>Cancel</button>}
    </div>
  );
}

export function SearchPanel<T>({ mode, value, onChange, onSubmit, inspect, onPick, sampleId, compact = false }: {
  mode: Mode;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  inspect: ReturnType<typeof useInspect<T>>;
  onPick: (id: string) => void;
  sampleId?: string;
  compact?: boolean;
}) {
  const { state, cancel, run } = inspect;
  const copy = COPY[mode];
  const running = state.status === "running";
  const [pasteOpen, setPasteOpen] = useState(false);
  const [source, setSource] = useState("");
  const blocked = state.status === "error" && /bot protection|refused the request|answered HTTP/.test(state.error);
  const scanSource = () => { if (source.trim() && !running) void run(source, { source: "html" }); };
  const trimmed = value.trim();
  const siteUrl = trimmed && !/^(GTM|GT|G)-/i.test(trimmed) && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(trimmed) ? (/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`) : "";
  const openPaste = () => {
    setPasteOpen(true);
    requestAnimationFrame(() => {
      const box = document.getElementById(`paste-box-${mode}`);
      box?.scrollIntoView({ behavior: "smooth", block: "start" });
      box?.querySelector("textarea")?.focus({ preventScroll: true });
    });
  };
  const showSteps = state.status === "running" || state.status === "error" || state.status === "choices";
  return (
    <section className={`hero ${compact ? "compact" : ""}`} aria-label={copy.title}>
      {!compact && (
        <>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="hero-title">{copy.title}</h1>
          <p className="hero-sub">{copy.sub}</p>
        </>
      )}
      <ModeSwitch mode={mode} />
      <form className="spotlight" onSubmit={(event) => { event.preventDefault(); if (trimmed && !running) onSubmit(trimmed); }}>
        <Icon name="search" />
        <label className="visually-hidden" htmlFor={`q-${mode}`}>{copy.placeholder}</label>
        <input id={`q-${mode}`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={copy.placeholder} autoComplete="off" spellCheck={false} />
        <button className="go" disabled={running || !trimmed} aria-label="Inspect">
          {running ? <span className="spinner light" aria-hidden="true" /> : <Icon name="arrow_forward" />}
        </button>
      </form>
      {!pasteOpen && (
        <p className="hints">
          {sampleId && state.status === "idle" && <button type="button" className="text-btn" onClick={() => { onChange(sampleId); onSubmit(sampleId); }}>Try an example</button>}
          <button type="button" className="text-btn" onClick={openPaste}>Paste page source</button>
        </p>
      )}
      {showSteps && <Steps logs={state.logs} running={running} progress={state.progress} onCancel={cancel} />}
      {state.status === "error" && !blocked && (
        <div className="alert-card" role="alert"><Icon name="error" fill /><span>{state.error}</span></div>
      )}
      {blocked && !pasteOpen && (
        <div className="unblock" role="alert">
          <span className="unblock-glyph"><Icon name="shield_lock" fill /></span>
          <h3>This site blocks automated visitors.</h3>
          <p>{shortError(state.error)}</p>
          <p className="muted">Your browser can still open it. Copy the page source from there and paste it here — it takes about 30 seconds.</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={openPaste}>Paste page source</button>
          <p className="unblock-alt">Or enter the {mode === "gtm" ? "GTM-" : "G-"} ID directly above.</p>
        </div>
      )}
      {pasteOpen && <PasteSourceBox mode={mode} siteUrl={siteUrl} source={source} onSource={setSource} running={running} onScan={scanSource} onClose={() => setPasteOpen(false)} />}
      {state.status === "choices" && (
        <div className="group choices">
          <div className="group-title">We found {state.choices.length} {mode === "gtm" ? "containers" : "Google tags"}. Choose one.</div>
          <div className="list">
            {state.choices.map((choice) => (
              <button type="button" className="cell" key={choice.id} onClick={() => onPick(choice.id)}>
                <span className={`glyph ${choice.kind === "GTM" ? "g-blue" : "g-orange"}`}><Icon name={choice.kind === "GTM" ? "deployed_code" : "bar_chart"} fill /></span>
                <span className="cell-text"><strong className="mono">{choice.id}</strong><small>Found in {choice.via}</small></span>
                <Icon name="chevron_right" className="chev" />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PasteSourceBox({ mode, siteUrl, source, onSource, running, onScan, onClose }: {
  mode: Mode; siteUrl: string; source: string; onSource: (value: string) => void; running: boolean; onScan: () => void; onClose: () => void;
}) {
  const [clipboardError, setClipboardError] = useState("");
  let host = "";
  try { host = siteUrl ? new URL(siteUrl).hostname : ""; } catch { /* not a URL */ }
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { setClipboardError("Your clipboard is empty — copy the page source first."); return; }
      onSource(text);
      setClipboardError("");
    } catch {
      setClipboardError("The browser didn't allow clipboard access — click the box below and press Ctrl+V instead.");
    }
  };
  return (
    <section className="paste" id={`paste-box-${mode}`} aria-label="Paste page source">
      <header>
        <h3>Paste the page source</h3>
        <button type="button" className="close" aria-label="Close" onClick={onClose}><Icon name="close" className="sm" /></button>
      </header>
      <ol className="howto">
        <li>
          <span className="num">1</span>
          <div>
            <strong>Open the website in your browser.</strong>
            <p>Let it load and pass any &ldquo;checking your browser&rdquo; screen.</p>
            {siteUrl && <a className="text-btn" href={siteUrl} target="_blank" rel="noopener noreferrer">Open {host || "the site"} <Icon name="north_east" className="xs" /></a>}
          </div>
        </li>
        <li>
          <span className="num">2</span>
          <div>
            <strong>View the page source.</strong>
            <p><kbd>Ctrl</kbd> <kbd>U</kbd> on Windows, <kbd>⌥</kbd> <kbd>⌘</kbd> <kbd>U</kbd> on Mac — or right-click and choose <em>View Page Source</em>.</p>
          </div>
        </li>
        <li>
          <span className="num">3</span>
          <div>
            <strong>Copy everything.</strong>
            <p><kbd>Ctrl</kbd> <kbd>A</kbd> then <kbd>Ctrl</kbd> <kbd>C</kbd> (<kbd>⌘</kbd> <kbd>A</kbd>, <kbd>⌘</kbd> <kbd>C</kbd> on Mac).</p>
          </div>
        </li>
        <li>
          <span className="num">4</span>
          <div>
            <strong>Paste it below.</strong>
            <p><button type="button" className="text-btn" onClick={pasteFromClipboard}>Paste from clipboard</button> or press <kbd>Ctrl</kbd> <kbd>V</kbd> in the box.</p>
            {clipboardError && <p className="clip-error">{clipboardError}</p>}
          </div>
        </li>
      </ol>
      <label className="visually-hidden" htmlFor={`paste-${mode}`}>Page source</label>
      <textarea id={`paste-${mode}`} value={source} onChange={(event) => onSource(event.target.value)} placeholder="<!DOCTYPE html>…" spellCheck={false} rows={5} />
      <footer>
        <span className="muted">{source ? `${formatBytes(source.length)} · only tag IDs are read, nothing is stored` : "Only GTM-, G- and GT- IDs are read. Nothing is stored."}</span>
        <button type="button" className="btn btn-primary" disabled={!source.trim() || running} onClick={onScan}>Find IDs</button>
      </footer>
    </section>
  );
}
