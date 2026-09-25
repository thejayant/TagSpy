"use client";

import { useEffect, useRef, useState } from "react";
import { FOLLOW_ENABLED, FOLLOW_PERKS } from "@/lib/features";
import { Icon, KIND_NOUN, SoonBadge, type WatchKind } from "./chrome";
import { Sheet } from "./sheet";
import { useToast } from "./toast";

export const EMAIL_KEY = "tagspy.email";
const LEGACY_EMAIL_KEY = "taglens.email";

export function readSavedEmail(): string {
  try { return localStorage.getItem(EMAIL_KEY) ?? localStorage.getItem(LEGACY_EMAIL_KEY) ?? ""; } catch { return ""; }
}

/** What Follow will offer; shown in place of the form while Follow (a paid feature) is not available yet. */
export function FollowComingSoon() {
  return (
    <div className="soon-panel">
      <span className="soon-badge large">Paid feature · Coming soon</span>
      <p>Follow is part of TagSpy&apos;s upcoming paid plan. It will include:</p>
      <ul>{FOLLOW_PERKS.map((perk) => <li key={perk}><Icon name="check_circle" fill className="sm" /> {perk}</li>)}</ul>
      <p className="muted small">Until then, nothing you scan is stored: every report lives only in your browser tab.</p>
    </div>
  );
}

export function WatchDialog(props: { kind: WatchKind; target: string; onClose: () => void }) {
  if (!FOLLOW_ENABLED) {
    return (
      <Sheet title={`Follow ${props.target}`} subtitle="Change history and alerts" onClose={props.onClose}>
        <FollowComingSoon />
        <button type="button" className="btn btn-block" onClick={props.onClose}>Got it</button>
      </Sheet>
    );
  }
  return <FollowForm {...props} />;
}

function FollowForm({ kind, target, onClose }: { kind: WatchKind; target: string; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [webhook, setWebhook] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Restore the email used last time on this device.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser storage after mount
    setEmail(readSavedEmail());
    first.current?.focus();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/watches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, target, email, webhook }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create the alert.");
      try { localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase()); } catch { /* storage unavailable */ }
      toast("You're following " + target, "We'll check it daily and tell you when it changes.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the alert.");
    } finally {
      setBusy(false);
    }
  }

  const noun = KIND_NOUN[kind];
  return (
    <Sheet title={`Follow ${target}`} subtitle={`Get notified when this ${noun} changes.`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted">We re-read it every day and alert you only when {kind === "site" ? "its stack, typefaces, palette or hosting" : "the published configuration"} actually changes{kind === "gtm" ? ". Every version is kept so you can compare them." : "."}</p>
        <div className="fields">
          <label className="field-row">
            <span>Email</span>
            <input ref={first} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" />
          </label>
          <label className="field-row">
            <span>Webhook</span>
            <input type="url" value={webhook} onChange={(event) => setWebhook(event.target.value)} placeholder="Optional — Slack, Teams or any https URL" />
          </label>
        </div>
        <p className="footnote-left">We POST JSON with a <code>text</code> field, which Slack and Teams incoming webhooks display directly.</p>
        {error && <div className="alert-card" role="alert"><Icon name="error" fill /><span>{error}</span></div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Saving…" : "Follow"}</button>
      </form>
    </Sheet>
  );
}

export function WatchBanner({ kind, target, onWatch }: { kind: WatchKind; target: string; variant?: "top" | "bottom"; onWatch: () => void }) {
  const noun = KIND_NOUN[kind];
  return (
    <section className="promo">
      <span className="promo-icon"><Icon name="notifications_active" fill /></span>
      <h3>Know the moment it changes. <SoonBadge /></h3>
      <p>Follow {target} and we&apos;ll check this {noun} every day. Email by default — add Slack, Teams or a webhook anytime.</p>
      <button type="button" className="btn btn-primary" onClick={onWatch}>{FOLLOW_ENABLED ? `Follow ${noun}` : "See what's coming"}</button>
    </section>
  );
}
