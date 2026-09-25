import { z } from "zod";
import { listChanges, listSnapshots, snapshotData } from "@/lib/db";
import { diffGa4, diffGtm, diffMeta, diffSegment, diffSite } from "@/lib/diff";
import type { SiteFingerprint } from "@/lib/site/fingerprint";
import { normalizeId } from "@/lib/ids";
import type { Ga4Report } from "@/lib/ga4/types";
import type { GtmContainer } from "@/lib/gtm/types";
import type { MetaPixelReport } from "@/lib/meta/types";
import type { SegmentReport } from "@/lib/segment/types";

export const dynamic = "force-dynamic";

const Query = z.object({ kind: z.enum(["ga4", "gtm", "meta", "segment", "site"]), target: z.string().min(3).max(300), from: z.coerce.number().int().optional(), to: z.coerce.number().int().optional() });

/**
 * Version history this server has observed for a target: every distinct published configuration it has read,
 * the changes detected between them, and (with `from` & `to`) a semantic diff between any two snapshots.
 */
export async function GET(request: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Pass kind=ga4|gtm|meta|segment|site and target=<ID or site address>." }, { status: 400 });
  const { kind, from, to } = parsed.data;
  const target = kind === "site" ? parsed.data.target.trim() : normalizeId(parsed.data.target);
  if (from !== undefined && to !== undefined) {
    const a = await snapshotData<Ga4Report | GtmContainer | MetaPixelReport | SegmentReport | SiteFingerprint>(from);
    const b = await snapshotData<Ga4Report | GtmContainer | MetaPixelReport | SegmentReport | SiteFingerprint>(to);
    if (!a || !b || a.target !== target || b.target !== target || a.kind !== kind || b.kind !== kind) return Response.json({ error: "Unknown snapshot for this target." }, { status: 404 });
    const entries = kind === "site" ? diffSite(a.data as SiteFingerprint, b.data as SiteFingerprint)
      : kind === "gtm" ? diffGtm(a.data as GtmContainer, b.data as GtmContainer)
      : kind === "meta" ? diffMeta(a.data as MetaPixelReport, b.data as MetaPixelReport)
      : kind === "segment" ? diffSegment(a.data as SegmentReport, b.data as SegmentReport)
      : diffGa4(a.data as Ga4Report, b.data as Ga4Report);
    return Response.json({ from: { id: a.id, version: a.version, fetchedAt: a.fetched_at }, to: { id: b.id, version: b.version, fetchedAt: b.fetched_at }, entries });
  }
  return Response.json({
    snapshots: await listSnapshots(kind, target),
    changes: (await listChanges({ kind, target, limit: 100 })).map((change) => ({ ...change, summary: JSON.parse(change.summary) })),
  });
}
