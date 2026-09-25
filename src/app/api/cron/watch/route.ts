import { storageKind } from "@/lib/db";
import { envNumber, envString } from "@/lib/env";
import { runDueChecks } from "@/lib/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled alert checks for hosts without a long-running worker (Vercel Cron, see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET the route refuses, so it can't be triggered by anyone.
 * Each run checks due targets for up to ~50 s; the least recently checked go first, so long lists rotate.
 */
export async function GET(request: Request) {
  const secret = envString("CRON_SECRET");
  if (!secret) return Response.json({ error: "Set CRON_SECRET to enable scheduled checks." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const logs: Record<string, unknown>[] = [];
  const result = await runDueChecks({ intervalHours: Math.max(0.05, envNumber("WATCH_INTERVAL_HOURS", 24)) - 0.5, budgetMs: 50_000, log: (entry) => { logs.push(entry); console.log(JSON.stringify(entry)); } });
  return Response.json({ ...result, storage: storageKind(), warning: storageKind() === "sqlite" && process.env.VERCEL ? "Watches live in /tmp on this instance; set DATABASE_URL (Turso) so alerts persist." : undefined, logs });
}
