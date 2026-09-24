import { deleteWatch, getWatch } from "@/lib/db";
import { errorResponse, rateLimited } from "@/lib/http";
import { sendTestWebhook } from "@/lib/notify";
import { checkTarget } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/watches/[id]">) {
  const { id } = await ctx.params;
  return deleteWatch(id) ? new Response(null, { status: 204 }) : Response.json({ error: "Alert not found." }, { status: 404 });
}

/** `{ action: "check" }` re-reads the target now; `{ action: "test" }` sends a test message to the webhook. */
export async function POST(request: Request, ctx: RouteContext<"/api/watches/[id]">) {
  const limited = rateLimited(request, "watch-action", 60);
  if (limited) return limited;
  const { id } = await ctx.params;
  const watch = getWatch(id);
  if (!watch) return Response.json({ error: "Alert not found." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "test") {
      if (!watch.webhook) return Response.json({ error: "This alert has no webhook." }, { status: 400 });
      await sendTestWebhook(watch.webhook, watch.target);
      return Response.json({ ok: true });
    }
    const result = await checkTarget(watch.kind, watch.target);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, 502);
  }
}
