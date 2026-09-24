import { errorResponse, rateLimited } from "@/lib/http";
import { inspectMeta } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/meta/[id]">) {
  const limited = rateLimited(request, "inspect");
  if (limited) return limited;
  const { id } = await ctx.params;
  try {
    const result = await inspectMeta(decodeURIComponent(id), { fresh: new URL(request.url).searchParams.has("fresh") });
    return Response.json({ model: result.model, changes: result.changes });
  } catch (error) {
    return errorResponse(error, 502);
  }
}
