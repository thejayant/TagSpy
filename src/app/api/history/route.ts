import { z } from "zod";
import { listChanges, listSnapshots, snapshotData } from "@/lib/db";
import { diffGa4, diffGtm } from "@/lib/diff";
import type { Ga4Report } from "@/lib/ga4/types";
import type { GtmContainer } from "@/lib/gtm/types";

export const dynamic = "force-dynamic";

const Query = z.object({ kind: z.enum(["ga4", "gtm"]), target: z.string().min(3).max(40).transform((value) => value.toUpperCase()), from: z.coerce.number().int().optional(), to: z.coerce.number().int().optional() });

/**
 * Version history this server has observed for a target: every distinct published configuration it has read,
 * the changes detected between them, and (with `from` & `to`) a semantic diff between any two snapshots.
 */
export async function GET(request: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Pass kind=ga4|gtm and target=<ID>." }, { status: 400 });
  const { kind, target, from, to } = parsed.data;
  if (from !== undefined && to !== undefined) {
    const a = snapshotData<Ga4Report | GtmContainer>(from);
    const b = snapshotData<Ga4Report | GtmContainer>(to);
    if (!a || !b || a.target !== target || b.target !== target || a.kind !== kind || b.kind !== kind) return Response.json({ error: "Unknown snapshot for this target." }, { status: 404 });
    const entries = kind === "gtm" ? diffGtm(a.data as GtmContainer, b.data as GtmContainer) : diffGa4(a.data as Ga4Report, b.data as Ga4Report);
    return Response.json({ from: { id: a.id, version: a.version, fetchedAt: a.fetched_at }, to: { id: b.id, version: b.version, fetchedAt: b.fetched_at }, entries });
  }
  return Response.json({
    snapshots: listSnapshots(kind, target),
    changes: listChanges({ kind, target, limit: 100 }).map((change) => ({ ...change, summary: JSON.parse(change.summary) })),
  });
}
