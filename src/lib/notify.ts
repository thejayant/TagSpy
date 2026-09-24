import type { ChangeRow, WatchRow } from "./db";
import { recordNotification } from "./db";
import type { DiffEntry } from "./diff";
import { appUrl, envString } from "./env";
import { assertSafeUrl } from "./url-safety";

export function describeChange(change: ChangeRow, entries: DiffEntry[]): { subject: string; text: string; link: string } {
  const link = `${appUrl()}/${change.kind}?id=${encodeURIComponent(change.target)}`;
  const version = change.kind === "gtm" && change.to_version ? ` (v${change.from_version ?? "?"} → v${change.to_version})` : "";
  const subject = `${change.target} changed${version}`;
  const lines = entries.slice(0, 25).map((entry) => `• [${entry.area}] ${entry.change} ${entry.label}${entry.detail ? ` — ${entry.detail}` : ""}`);
  if (entries.length > 25) lines.push(`…and ${entries.length - 25} more`);
  return { subject, link, text: `${subject}\n${lines.join("\n")}\n\nOpen: ${link}` };
}

async function sendWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  const target = await assertSafeUrl(url);
  if (target.protocol !== "https:") throw new Error("Webhooks must use https.");
  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "TagSpy-alerts/2.0" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Webhook answered HTTP ${response.status}`);
}

async function sendEmail(to: string, subject: string, text: string): Promise<"sent" | "skipped"> {
  const smtp = envString("SMTP_URL");
  if (!smtp) return "skipped";
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(smtp);
  await transport.sendMail({ from: envString("ALERTS_FROM") ?? "TagSpy alerts <alerts@localhost>", to, subject: `[TagSpy] ${subject}`, text });
  return "sent";
}

/** Delivers one change to one watcher by email (when SMTP is configured) and webhook (when set). Failures are recorded, not thrown. */
export async function deliver(watch: WatchRow, change: ChangeRow, entries: DiffEntry[]): Promise<void> {
  const message = describeChange(change, entries);
  try {
    const status = await sendEmail(watch.email, message.subject, message.text);
    recordNotification(watch.id, change.id, "email", status, status === "skipped" ? "SMTP_URL is not configured" : undefined);
  } catch (error) {
    recordNotification(watch.id, change.id, "email", "failed", error instanceof Error ? error.message : String(error));
  }
  if (watch.webhook) {
    try {
      await sendWebhook(watch.webhook, { text: message.text, target: change.target, kind: change.kind, fromVersion: change.from_version, toVersion: change.to_version, link: message.link, changes: entries });
      recordNotification(watch.id, change.id, "webhook", "sent");
    } catch (error) {
      recordNotification(watch.id, change.id, "webhook", "failed", error instanceof Error ? error.message : String(error));
    }
  }
}

export async function sendTestWebhook(url: string, target: string): Promise<void> {
  await sendWebhook(url, { text: `TagSpy test alert: you'll be notified here when ${target} changes.`, target, test: true });
}
