import { randomUUID } from "node:crypto";
import { z } from "zod";
import { FOLLOW_ENABLED } from "@/lib/features";
import { createWatch, listChanges, listNotifications, listWatches } from "@/lib/db";
import { errorResponse, rateLimited } from "@/lib/http";
import { idKind, normalizeId, parseInput } from "@/lib/ids";
import { inspectGa4, inspectGtm, inspectMeta, inspectSegment, inspectSite } from "@/lib/service";
import { siteAddress } from "@/lib/site/fingerprint";
import { assertSafeUrl } from "@/lib/url-safety";

export const dynamic = "force-dynamic";

const Create = z.object({
  kind: z.enum(["ga4", "gtm", "meta", "segment", "site"]),
  target: z.string().max(2048),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  webhook: z.string().trim().max(2000).optional().transform((value) => value || null),
});

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const email = params.get("email")?.trim().toLowerCase() || undefined;
  const watches = await listWatches({ email });
  return Response.json({
    watches: await Promise.all(watches.map(async (watch) => ({
      ...watch,
      webhook: watch.webhook ? watch.webhook.replace(/^(https:\/\/[^/]+\/).+$/, "$1…") : null,
      changes: (await listChanges({ kind: watch.kind, target: watch.target, limit: 10 })).map((change) => ({ ...change, summary: JSON.parse(change.summary) })),
      notifications: (await listNotifications(watch.id)).slice(0, 10),
    }))),
  });
}

/** Starts watching a GA4 property or GTM container. The current configuration is stored as the baseline. */
export async function POST(request: Request) {
  if (!FOLLOW_ENABLED) return Response.json({ error: "Follow is a paid feature that is coming soon." }, { status: 403 });
  const limited = await rateLimited(request, "watch", 30);
  if (limited) return limited;
  const parsed = Create.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const { kind, email, webhook } = parsed.data;
  const target = kind === "site" ? parsed.data.target.trim() : normalizeId(parsed.data.target);
  const idType = idKind(target);
  const valid = kind === "gtm" ? idType === "GTM" : kind === "meta" ? idType === "META" : kind === "segment" ? idType === "SEGMENT" : idType === "GA4" || idType === "GT";
  if (kind === "site") {
    const input = (() => { try { return parseInput(target); } catch { return null; } })();
    if (input?.type !== "url") return Response.json({ error: "Enter a website address to follow." }, { status: 400 });
  } else if (!valid) return Response.json({ error: `${target} is not a valid ${kind === "gtm" ? "container" : kind === "meta" ? "Meta Pixel" : kind === "segment" ? "Segment write key" : "GA4"} ID.` }, { status: 400 });
  try {
    if (webhook) {
      const url = await assertSafeUrl(webhook);
      if (url.protocol !== "https:") throw new Error("Webhook URLs must use https.");
    }
    // A site is stored under its address after redirects ("rockstargames.com/vi"), the same key its snapshots use.
    const baseline = kind === "site" ? siteAddress((await inspectSite({ url: (parseInput(target) as { url: string }).url }, { track: true })).report.finalUrl)
      : kind === "gtm" ? (await inspectGtm(target, { track: true })).model.id : kind === "meta" ? (await inspectMeta(target, { track: true })).model.pixelId : kind === "segment" ? (await inspectSegment(target, { track: true })).model.writeKey : (await inspectGa4(target, { track: true })).model.measurementId;
    const watch = await createWatch({ id: randomUUID(), kind, target: baseline, email, webhook });
    return Response.json({ watch: { ...watch, webhook: watch.webhook ? "configured" : null } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
