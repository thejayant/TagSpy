import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createWatch, listChanges, listNotifications, listWatches } from "@/lib/db";
import { errorResponse, rateLimited } from "@/lib/http";
import { idKind, normalizeId } from "@/lib/ids";
import { inspectGa4, inspectGtm, inspectMeta, inspectSegment } from "@/lib/service";
import { assertSafeUrl } from "@/lib/url-safety";

export const dynamic = "force-dynamic";

const Create = z.object({
  kind: z.enum(["ga4", "gtm", "meta", "segment"]),
  target: z.string().transform(normalizeId),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  webhook: z.string().trim().max(2000).optional().transform((value) => value || null),
});

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const email = params.get("email")?.trim().toLowerCase() || undefined;
  const watches = listWatches({ email });
  return Response.json({
    watches: watches.map((watch) => ({
      ...watch,
      webhook: watch.webhook ? watch.webhook.replace(/^(https:\/\/[^/]+\/).+$/, "$1…") : null,
      changes: listChanges({ kind: watch.kind, target: watch.target, limit: 10 }).map((change) => ({ ...change, summary: JSON.parse(change.summary) })),
      notifications: listNotifications(watch.id).slice(0, 10),
    })),
  });
}

/** Starts watching a GA4 property or GTM container. The current configuration is stored as the baseline. */
export async function POST(request: Request) {
  const limited = rateLimited(request, "watch", 30);
  if (limited) return limited;
  const parsed = Create.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const { kind, target, email, webhook } = parsed.data;
  const idType = idKind(target);
  const valid = kind === "gtm" ? idType === "GTM" : kind === "meta" ? idType === "META" : kind === "segment" ? idType === "SEGMENT" : idType === "GA4" || idType === "GT";
  if (!valid) return Response.json({ error: `${target} is not a valid ${kind === "gtm" ? "container" : kind === "meta" ? "Meta Pixel" : kind === "segment" ? "Segment write key" : "GA4"} ID.` }, { status: 400 });
  try {
    if (webhook) {
      const url = await assertSafeUrl(webhook);
      if (url.protocol !== "https:") throw new Error("Webhook URLs must use https.");
    }
    const baseline = kind === "gtm" ? (await inspectGtm(target)).model.id : kind === "meta" ? (await inspectMeta(target)).model.pixelId : kind === "segment" ? (await inspectSegment(target)).model.writeKey : (await inspectGa4(target)).model.measurementId;
    const watch = createWatch({ id: randomUUID(), kind, target: baseline, email, webhook });
    return Response.json({ watch: { ...watch, webhook: watch.webhook ? "configured" : null } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
