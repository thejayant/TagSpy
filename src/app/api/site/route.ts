import { errorResponse, rateLimited } from "@/lib/http";
import { parseInput } from "@/lib/ids";
import { inspectSite } from "@/lib/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/site?url=example.com → the Site DNA report as JSON (nothing is stored). */
export async function GET(request: Request) {
  const limited = await rateLimited(request, "inspect");
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  try {
    const target = parseInput(params.get("url") ?? "");
    if (target.type !== "url") throw new Error("Pass a website address, e.g. ?url=example.com.");
    const { report } = await inspectSite({ url: target.url }, { signal: request.signal });
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
