import { errorResponse, rateLimited } from "@/lib/http";
import { inspectGa4 } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/ga4/[id]">) {
  const limited = rateLimited(request, "inspect");
  if (limited) return limited;
  const { id } = await ctx.params;
  try {
    const result = await inspectGa4(decodeURIComponent(id), { fresh: new URL(request.url).searchParams.has("fresh") });
    return Response.json({ model: result.model, changes: result.changes });
  } catch (error) {
    return errorResponse(error, 502);
  }
}
