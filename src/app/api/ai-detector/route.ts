import { randomUUID } from "node:crypto";
import { z } from "zod";
import { detectAi } from "@/lib/ai/service";
import { consumeLifetime, lifetimeUsed, refundLifetime } from "@/lib/db";
import { envNumber } from "@/lib/env";
import { clientKey, rateLimited } from "@/lib/http";
import { parseInput } from "@/lib/ids";
import { deepScanStatus } from "@/lib/site/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The render keeps its own budget (DEEP_SCAN_SECONDS) and returns partial results before this limit.
export const maxDuration = 60;

/**
 * The AI Website Detector renders the site in a real browser, which costs money on every run, so each person gets one
 * free run. A long-lived, HttpOnly cookie holds an opaque ID; a per-address lifetime cap is the backstop for cleared
 * cookies (a few, not one, so people sharing an office or mobile network are not locked out by a stranger).
 * A run only counts when it delivers a result: errors and cancels give it back.
 */
const COOKIE = "tagspy_ai";
const perUser = () => envNumber("AI_DETECT_PER_USER", 1);
const perAddress = () => envNumber("AI_DETECT_PER_IP", 3);
const userId = (request: Request) => /(?:^|;\s*)tagspy_ai=([0-9a-f-]{36})/.exec(request.headers.get("cookie") ?? "")?.[1] ?? null;
const cookieHeader = (id: string) => `${COOKIE}=${id}; Path=/api/ai-detector; Max-Age=31536000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
/** The address cap needs real client addresses; locally every request comes from "local". */
const addressCapped = () => process.env.NODE_ENV === "production";

export async function GET(request: Request) {
  const status = deepScanStatus();
  const id = userId(request);
  const used = id ? await lifetimeUsed(`ai:user:${id}`).catch(() => 0) : 0;
  const byAddress = addressCapped() ? await lifetimeUsed(`ai:ip:${clientKey(request)}`).catch(() => 0) : 0;
  const remaining = Math.max(0, Math.min(perUser() - used, addressCapped() ? perAddress() - byAddress : Infinity));
  return Response.json({ enabled: status.enabled, reason: status.reason, perUser: perUser(), remaining }, { headers: { "Cache-Control": "no-store" } });
}

const Body = z.object({ url: z.string().min(3).max(2048) });

export async function POST(request: Request) {
  const status = deepScanStatus();
  if (!status.enabled) return Response.json({ error: status.reason ?? "The AI check is not available on this server." }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send { url }." }, { status: 400 });
  let url: string;
  try {
    const target = parseInput(parsed.data.url);
    if (target.type !== "url") throw new Error("Enter a website address, like example.com.");
    url = target.url;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid address." }, { status: 400 });
  }

  const limited = await rateLimited(request, "ai-detector", 8);
  if (limited) return limited;
  const id = userId(request) ?? randomUUID();
  const setCookie = { "Set-Cookie": cookieHeader(id) };
  const userKey = `ai:user:${id}`;
  const addressKey = `ai:ip:${clientKey(request)}`;
  const used = () => Response.json({ error: "You've used your free AI check.", code: "used" }, { status: 429, headers: setCookie });
  if (!(await consumeLifetime(userKey, perUser()))) return used();
  if (addressCapped() && !(await consumeLifetime(addressKey, perAddress()))) { await refundLifetime(userKey); return used(); }
  const refund = async () => { await refundLifetime(userKey).catch(() => {}); if (addressCapped()) await refundLifetime(addressKey).catch(() => {}); };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => { try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { /* cancelled */ } };
      let delivered = false;
      try {
        const report = await detectAi(url, {
          signal: request.signal,
          log: (text, level = "info") => { if (!request.signal.aborted) send({ type: "log", text, level }); },
          stage: (stage, state, detail) => { if (!request.signal.aborted) send({ type: "stage", stage, state, detail }); },
        });
        if (!request.signal.aborted) { send({ type: "result", model: report }); delivered = true; }
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "The AI check failed." });
      } finally {
        // Only a delivered result uses up the free run.
        if (!delivered) await refund();
        try { controller.close(); } catch { /* already closed by a cancel */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", ...setCookie } });
}
