import { randomUUID } from "node:crypto";
import { z } from "zod";
import { consumeQuota, quotaUsed, refundQuota, storageKind } from "@/lib/db";
import { envNumber } from "@/lib/env";
import { rateLimited } from "@/lib/http";
import { parseInput } from "@/lib/ids";
import { inspectSiteDeep } from "@/lib/service";
import { deepScanStatus } from "@/lib/site/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The deep scan keeps its own 50 s budget (DEEP_SCAN_SECONDS) and returns partial results before this limit.
export const maxDuration = 60;

/**
 * A visit is a browser session: an opaque, HttpOnly session cookie (gone when the browser closes) holds a random ID that
 * counts deep scans. Clearing cookies gives a new visit, so the per-IP hourly limit stays in place as a backstop.
 */
const COOKIE = "tagspy_visit";
const perVisit = () => envNumber("DEEP_SCAN_PER_VISIT", 3);
const visitId = (request: Request) => /(?:^|;\s*)tagspy_visit=([0-9a-f-]{36})/.exec(request.headers.get("cookie") ?? "")?.[1] ?? null;
const cookieHeader = (id: string) => `${COOKIE}=${id}; Path=/api/site/deep; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;

/** Whether this server can run deep scans, and how many this visit has left (the UI enables the button from this). */
export async function GET(request: Request) {
  const id = visitId(request);
  const used = id ? await quotaUsed(`deep:${id}`).catch(() => 0) : 0;
  return Response.json({ ...deepScanStatus(), storage: storageKind(), perVisit: perVisit(), remaining: Math.max(0, perVisit() - used) }, { headers: { "Cache-Control": "no-store" } });
}

const Body = z.object({ url: z.string().min(3).max(2048) });

/** Renders the site in a headless browser and streams NDJSON progress, then the merged report. Nothing is stored. */
export async function POST(request: Request) {
  const status = deepScanStatus();
  if (!status.enabled) return Response.json({ error: status.reason }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send { url }." }, { status: 400 });
  let url: string;
  try {
    const target = parseInput(parsed.data.url);
    if (target.type !== "url") throw new Error("Enter a website address, not a tag ID.");
    url = target.url;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid address." }, { status: 400 });
  }
  const id = visitId(request) ?? randomUUID();
  const setCookie = { "Set-Cookie": cookieHeader(id) };
  const quotaKey = `deep:${id}`;
  if (!(await consumeQuota(quotaKey, perVisit()))) {
    return Response.json({ error: `You've used all ${perVisit()} deep scans for this visit. Static scans are still unlimited; deep scans reset when you start a new browser session.` }, { status: 429, headers: setCookie });
  }
  const limited = await rateLimited(request, "render", envNumber("DEEP_SCAN_PER_HOUR", 10));
  if (limited) { await refundQuota(quotaKey); return limited; }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // The visitor may cancel mid-scan; writing to a closed stream must not throw.
      const send = (event: unknown) => { try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { /* cancelled */ } };
      try {
        const left = perVisit() - (await quotaUsed(quotaKey));
        send({ type: "log", text: `Deep scan started · ${left} of ${perVisit()} left for this visit`, level: "info" });
        const report = await inspectSiteDeep(url, { signal: request.signal, log: (text, level = "info") => { if (!request.signal.aborted) send({ type: "log", text, level }); } });
        send({ type: "result", kind: "site", id: report.host, model: report, changes: [] });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The deep scan failed.";
        // Failures on our side don't use up the visitor's quota; a cancel does (it still ran a browser).
        if (!request.signal.aborted && /Another deep scan|not available|No browser|Could not start|browser|Protocol error|Target closed/i.test(message)) await refundQuota(quotaKey).catch(() => {});
        send({ type: "error", message });
      } finally {
        try { controller.close(); } catch { /* already closed by a cancel */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", ...setCookie } });
}
