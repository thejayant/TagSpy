import { exportContainer } from "@/lib/gtm/export";
import { errorResponse, rateLimited } from "@/lib/http";
import { inspectGtm } from "@/lib/service";

export const dynamic = "force-dynamic";

/** Downloads the published container rebuilt as a Tag Manager import file (exportFormatVersion 2). */
export async function GET(request: Request, ctx: RouteContext<"/api/gtm/[id]/export">) {
  const limited = await rateLimited(request, "inspect");
  if (limited) return limited;
  const { id } = await ctx.params;
  try {
    const { model, source } = await inspectGtm(decodeURIComponent(id));
    const { json, skipped } = exportContainer(source, model);
    const filename = `${model.id}_v${model.version ?? "latest"}_import.json`;
    return new Response(JSON.stringify(json, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Skipped-Items": String(skipped.length),
      },
    });
  } catch (error) {
    return errorResponse(error, 502);
  }
}
