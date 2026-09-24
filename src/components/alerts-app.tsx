"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon, SiteFooter, SiteHeader, formatDateTime } from "./chrome";
import { DiffList } from "./history";
import { useToast } from "./toast";
import { EMAIL_KEY, readSavedEmail } from "./watch-dialog";

type Entry = Parameters<typeof DiffList>[0]["entries"][number];
interface Watch {
  id: string; kind: "ga4" | "gtm"; target: string; email: string; webhook: string | null; created_at: string;
  last_checked_at: string | null; last_status: string | null; last_error: string | null;
  changes: { id: number; detected_at: string; from_version: string | null; to_version: string | null; summary: Entry[] }[];
  notifications: { id: number; channel: string; status: string; error: string | null; created_at: string }[];
}

export function AlertsApp() {
  const [email, setEmail] = useState("");
  const [watches, setWatches] = useState<Watch[] | null>(null);
  const [busy, setBusy] = useState<string>("");
  const toast = useToast();

  const load = useCallback(async (filter: string) => {
    const response = await fetch(`/api/watches${filter ? `?email=${encodeURIComponent(filter)}` : ""}`, { cache: "no-store" });
    const body = await response.json();
    setWatches(body.watches ?? []);
  }, []);

  useEffect(() => {
    const saved = readSavedEmail();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the email saved on this device, then load
    setEmail(saved);
    void load(saved);
  }, [load]);

  async function act(watch: Watch, action: "check" | "test" | "delete") {
    setBusy(`${watch.id}:${action}`);
    try {
      if (action === "delete") {
        if (!confirm(`Stop watching ${watch.target}?`)) return;
        const response = await fetch(`/api/watches/${watch.id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Could not delete the alert.");
        toast("Alert removed", watch.target);
      } else {
        const response = await fetch(`/api/watches/${watch.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Request failed");
        toast(action === "test" ? "Test message sent" : body.changed ? `${body.changes.length} changes detected` : "No changes", action === "test" ? "Check your Slack/Teams channel." : watch.target);
      }
      await load(email);
    } catch (error) {
      toast("Something went wrong", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <SiteHeader />
      <main>
        <div className="page">
          <section className="hero compact-top">
            <p className="eyebrow">Alerts</p>
            <h1 className="hero-title">Following.</h1>
            <p className="hero-sub">Everything you follow is re-read daily. When a published configuration changes, you get an email (if SMTP is configured on this server) and a webhook message.</p>
            <form className="spotlight" onSubmit={(event) => { event.preventDefault(); try { localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase()); } catch { /* ignore */ } void load(email.trim()); }}>
              <Icon name="mail" /><label className="visually-hidden" htmlFor="alerts-email">Email</label><input id="alerts-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Your email — leave empty to show all" />
              <button className="go" aria-label="Show alerts"><Icon name="arrow_forward" /></button>
            </form>
          </section>

          {watches === null ? <p className="muted">Loading…</p> : watches.length === 0 ? (
            <section className="empty-state big">
              <Icon name="notifications_off" />
              <h3>No alerts yet</h3>
              <p>Open a <Link href="/ga4">GA4 property</Link> or a <Link href="/gtm">GTM container</Link> and choose &ldquo;Follow&rdquo;.</p>
            </section>
          ) : watches.map((watch) => (
            <section className="watch-card" key={watch.id}>
              <header>
                <span className={`glyph ${watch.kind === "gtm" ? "g-blue" : "g-orange"}`}><Icon name={watch.kind === "gtm" ? "deployed_code" : "bar_chart"} fill /></span>
                <div>
                  <Link href={`/${watch.kind}?id=${encodeURIComponent(watch.target)}`}><code>{watch.target}</code></Link>
                  <div className="muted" style={{ fontSize: 13 }}>{watch.kind === "gtm" ? "Tag Manager container" : "GA4 property"} · {watch.email}</div>
                </div>
                <div className="buttons">
                  <button type="button" className="btn" disabled={!!busy} onClick={() => act(watch, "check")}><Icon name={busy === `${watch.id}:check` ? "progress_activity" : "refresh"} className="sm" /> Check now</button>
                  {watch.webhook && <button type="button" className="btn" disabled={!!busy} onClick={() => act(watch, "test")}><Icon name="send" className="sm" /> Test webhook</button>}
                  <button type="button" className="btn btn-danger" disabled={!!busy} onClick={() => act(watch, "delete")}><Icon name="delete" className="sm" /> Remove</button>
                </div>
              </header>
              <div className="meta">
                <span>Watching since {formatDateTime(watch.created_at)}</span>
                <span>Last checked {formatDateTime(watch.last_checked_at)}</span>
                {watch.last_status && <span className={`chip ${watch.last_status === "error" ? "chip-danger" : watch.last_status === "changed" ? "chip-warn" : "chip-ok"}`}>{watch.last_status}</span>}
                <span>Webhook: {watch.webhook ?? "none"}</span>
              </div>
              {watch.last_error && <div className="alert-card"><Icon name="error" fill /><span>{watch.last_error}</span></div>}
              {watch.changes.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>{watch.changes.length} recent change{watch.changes.length === 1 ? "" : "s"}</summary>
                  {watch.changes.map((change) => (
                    <div key={change.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}>
                      <div className="muted" style={{ fontSize: 13 }}>{formatDateTime(change.detected_at)}{watch.kind === "gtm" ? ` · v${change.from_version ?? "?"} → v${change.to_version ?? "?"}` : ""}</div>
                      <DiffList entries={change.summary} limit={8} />
                    </div>
                  ))}
                </details>
              )}
              {watch.notifications.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>Delivery log</summary>
                  {watch.notifications.map((item) => <div key={item.id} className="diff-entry"><span className={`tag ${item.status === "sent" ? "added" : item.status === "failed" ? "removed" : "changed"}`}>{item.status}</span><span>{item.channel}</span><span className="muted">{formatDateTime(item.created_at)}{item.error ? ` — ${item.error}` : ""}</span></div>)}
                </details>
              )}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
