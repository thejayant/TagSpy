"use client";

import { useCallback, useEffect, useState } from "react";
import type { ContextMode } from "@/lib/site-context";
import { Icon, KIND_NOUN, formatDateTime } from "./chrome";

interface Snapshot { id: number; version: string | null; fetched_at: string; last_seen_at: string }
interface Entry { area: string; change: "added" | "removed" | "changed"; label: string; detail?: string }
interface Change { id: number; from_version: string | null; to_version: string | null; detected_at: string; summary: Entry[] }

export function DiffList({ entries, limit }: { entries: Entry[]; limit?: number }) {
  const [all, setAll] = useState(false);
  if (!entries.length) return <p className="muted" style={{ margin: 0 }}>No differences.</p>;
  const shown = all || !limit ? entries : entries.slice(0, limit);
  return (
    <div>
      {shown.map((entry, index) => (
        <div className="diff-entry" key={index}>
          <span className={`tag ${entry.change}`}>{entry.change}</span>
          <span className="muted" style={{ flex: "none" }}>{entry.area}</span>
          <span style={{ overflowWrap: "anywhere" }}>{entry.label}{entry.detail && <span className="muted"> — {entry.detail}</span>}</span>
        </div>
      ))}
      {limit && entries.length > limit && !all && <button type="button" className="btn btn-ghost" onClick={() => setAll(true)}>Show {entries.length - limit} more</button>}
    </div>
  );
}

export function HistoryPanel({ kind, target, refreshKey, onWatch }: { kind: ContextMode; target: string; refreshKey?: unknown; onWatch: () => void }) {
  const [data, setData] = useState<{ snapshots: Snapshot[]; changes: Change[] } | null>(null);
  const [error, setError] = useState("");
  const [from, setFrom] = useState<number | "">("");
  const [to, setTo] = useState<number | "">("");
  const [diff, setDiff] = useState<Entry[] | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/history?kind=${kind}&target=${encodeURIComponent(target)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load history.");
    }
  }, [kind, target]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; state updates happen after the request resolves
    void load();
  }, [load, refreshKey]);

  async function compare() {
    if (from === "" || to === "") return;
    const response = await fetch(`/api/history?kind=${kind}&target=${encodeURIComponent(target)}&from=${from}&to=${to}`);
    const body = await response.json();
    setDiff(response.ok ? body.entries : []);
  }

  const label = (snapshot: Snapshot) => `${kind === "gtm" ? `v${snapshot.version ?? "?"}` : kind === "meta" ? "Configuration" : `Library v${snapshot.version ?? "?"}`} · first seen ${formatDateTime(snapshot.fetched_at)}`;
  if (error) return <div className="alert-card"><Icon name="error" fill /><span>{error}</span></div>;
  if (!data) return <p className="muted">Loading history…</p>;
  return (
    <div className="stack">
      <section className="card collapse">
        <div className="list-head"><h2>Observed versions</h2><small>{data.snapshots.length} distinct configuration{data.snapshots.length === 1 ? "" : "s"} seen by this server</small></div>
        <div className="version-list">
          {data.snapshots.map((snapshot, index) => (
            <div className="version-item" key={snapshot.id}>
              <strong className="mono">{kind === "gtm" ? `v${snapshot.version ?? "?"}` : `#${data.snapshots.length - index}`}</strong>
              <span className="muted">First seen {formatDateTime(snapshot.fetched_at)} · last seen {formatDateTime(snapshot.last_seen_at)}</span>
              {index === 0 ? <span className="chip">Current</span> : <span />}
            </div>
          ))}
        </div>
      </section>

      {data.snapshots.length > 1 && (
        <section className="card card-pad">
          <h3 style={{ margin: "0 0 12px" }}>Compare two versions</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select className="btn" value={from} onChange={(event) => setFrom(event.target.value ? Number(event.target.value) : "")} aria-label="From version">
              <option value="">From…</option>
              {data.snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{label(snapshot)}</option>)}
            </select>
            <Icon name="arrow_forward" />
            <select className="btn" value={to} onChange={(event) => setTo(event.target.value ? Number(event.target.value) : "")} aria-label="To version">
              <option value="">To…</option>
              {data.snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{label(snapshot)}</option>)}
            </select>
            <button type="button" className="btn btn-primary" disabled={from === "" || to === ""} onClick={compare}>Compare</button>
          </div>
          {diff && <div style={{ marginTop: 14 }}><DiffList entries={diff} /></div>}
        </section>
      )}

      <section className="card card-pad">
        <h3 style={{ margin: "0 0 12px" }}>Detected changes</h3>
        {data.changes.length ? data.changes.map((change) => (
          <details key={change.id} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
            <summary style={{ cursor: "pointer" }}>
              <strong>{formatDateTime(change.detected_at)}</strong>
              <span className="muted"> · {kind === "gtm" ? `v${change.from_version ?? "?"} → v${change.to_version ?? "?"}` : "configuration changed"} · {change.summary.length} change{change.summary.length === 1 ? "" : "s"}</span>
            </summary>
            <div style={{ marginTop: 8 }}><DiffList entries={change.summary} limit={30} /></div>
          </details>
        )) : <p className="muted" style={{ margin: 0 }}>No changes detected yet. Each time this {KIND_NOUN[kind]} is read, a new version is stored only if its configuration differs.</p>}
      </section>

      <section className="promo">
        <span className="promo-icon"><Icon name="history" /></span>
        <h3>Keep every version.</h3>
        <p>Follow this {KIND_NOUN[kind]} and we re-read it daily, keep each published version side by side, and alert you whenever it changes. Google itself only publishes the live version.</p>
        <button type="button" className="btn btn-primary" onClick={onWatch}>Follow {KIND_NOUN[kind]}</button>
      </section>
    </div>
  );
}
