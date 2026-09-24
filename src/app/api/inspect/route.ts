import { z } from "zod";
import { formatBytes } from "@/lib/compiled";
import { discoverIds, ga4IdsFromContainers, idsFromSource, type FoundId } from "@/lib/discover";
import { rateLimited } from "@/lib/http";
import { parseInput } from "@/lib/ids";
import { inspectGa4, inspectGtm } from "@/lib/service";

export const dynamic = "force-dynamic";

/** `input` is an ID or URL; `html` is page source pasted by the user when a site blocks automated reads. */
const Body = z.object({
  mode: z.enum(["ga4", "gtm"]),
  input: z.string().min(1).max(2048).optional(),
  html: z.string().min(1).max(8_000_000).optional(),
  fresh: z.boolean().optional(),
}).refine((body) => !!body.input !== !!body.html, "Send either input or html.");

type Event =
  | { type: "log"; text: string; level?: "info" | "ok" | "warn" }
  | { type: "choices"; ids: FoundId[] }
  | { type: "result"; kind: "ga4" | "gtm"; id: string; model: unknown; changes: unknown[] }
  | { type: "error"; message: string };

/** Streams NDJSON progress lines, then either a result, a list of IDs to choose from, or an error. */
export async function POST(request: Request) {
  const limited = rateLimited(request, "inspect");
  if (limited) return limited;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send { mode: 'ga4' | 'gtm' } with either input (ID or URL) or html (page source)." }, { status: 400 });
  const { mode, input, html, fresh } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const log = (text: string, level: "info" | "ok" | "warn" = "info") => send({ type: "log", text, level });
      const run = async (id: string) => {
        if (mode === "gtm") {
          log(`Fetching published container ${id} from googletagmanager.com`);
          const result = await inspectGtm(id, { fresh });
          log(`Decoded ${result.model.tags.length} tags, ${result.model.triggers.length} triggers and ${result.model.variables.length} variables (v${result.model.version ?? "?"})`, "ok");
          if (result.changes.length) log(`${result.changes.length} changes since the last read`, "warn");
          send({ type: "result", kind: "gtm", id: result.model.id, model: result.model, changes: result.changes });
        } else {
          log(`Fetching Google tag ${id} from googletagmanager.com`);
          const result = await inspectGa4(id, { fresh });
          log(`Decoded library v${result.model.libraryVersion ?? "?"}: ${result.model.keyEvents.length} key events, ${result.model.createdEvents.length} created and ${result.model.modifiedEvents.length} modified events`, "ok");
          if (result.changes.length) log(`${result.changes.length} changes since the last read`, "warn");
          send({ type: "result", kind: "ga4", id: result.model.measurementId, model: result.model, changes: result.changes });
        }
      };
      const choose = async (ids: FoundId[]) => {
        if (ids.length === 1) { log(`Found ${ids[0].id} (${ids[0].via})`, "ok"); await run(ids[0].id); }
        else { log(`Found ${ids.length} candidates — pick one`, "ok"); send({ type: "choices", ids }); }
      };
      const fromFound = async (found: FoundId[], where: string) => {
        let candidates = found.filter((item) => (mode === "gtm" ? item.kind === "GTM" : item.kind !== "GTM"));
        if (mode === "ga4" && !candidates.length) {
          const containers = found.filter((item) => item.kind === "GTM").map((item) => item.id);
          if (containers.length) candidates = await ga4IdsFromContainers(containers, log);
        }
        if (!candidates.length) throw new Error(mode === "gtm" ? `No Google Tag Manager container was found in ${where}.` : `No GA4 Google tag was found in ${where}.`);
        await choose(candidates);
      };
      try {
        if (html) {
          log(`Scanning ${formatBytes(new TextEncoder().encode(html).length)} of pasted page source`);
          await fromFound(idsFromSource(html), "the pasted source");
          return;
        }
        const target = parseInput(input!);
        if (target.type === "id") {
          if (mode === "gtm" && target.kind !== "GTM") throw new Error(`${target.id} is a Google tag, not a container. Use the Web tab for GA4 IDs, or enter GTM-XXXXXXX.`);
          if (mode === "ga4" && target.kind === "GTM") {
            log(`${target.id} is a container — looking for the GA4 tags it loads`);
            const ids = await ga4IdsFromContainers([target.id], log);
            if (!ids.length) throw new Error(`No GA4 measurement ID is configured in ${target.id}.`);
            await choose(ids);
          } else await run(target.id);
        } else {
          log(`Resolving ${new URL(target.url).hostname}`);
          await fromFound(await discoverIds(target.url, log), "that page");
        }
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
