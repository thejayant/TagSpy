import { z } from "zod";
import { formatBytes } from "@/lib/compiled";
import { discoverIds, ga4IdsFromContainers, idsFromSource, pixelIdsFromContainers, segmentKeysFromContainers, type FoundId } from "@/lib/discover";
import { rateLimited } from "@/lib/http";
import { parseInput } from "@/lib/ids";
import { inspectGa4, inspectGtm, inspectMeta, inspectSegment } from "@/lib/service";

export const dynamic = "force-dynamic";

/** `input` is an ID or URL; `html` is page source pasted by the user when a site blocks automated reads. */
const Body = z.object({
  mode: z.enum(["ga4", "gtm", "meta", "segment"]),
  input: z.string().min(1).max(2048).optional(),
  html: z.string().min(1).max(8_000_000).optional(),
  fresh: z.boolean().optional(),
}).refine((body) => !!body.input !== !!body.html, "Send either input or html.");

type Event =
  | { type: "log"; text: string; level?: "info" | "ok" | "warn" }
  | { type: "choices"; ids: FoundId[] }
  /** Every ID discovered along the way, so the client can link the site's GA4, GTM and Meta views together. */
  | { type: "found"; ids: string[] }
  | { type: "result"; kind: "ga4" | "gtm" | "meta" | "segment"; id: string; model: unknown; changes: unknown[] }
  | { type: "error"; message: string };

/** Streams NDJSON progress lines, then either a result, a list of IDs to choose from, or an error. */
export async function POST(request: Request) {
  const limited = rateLimited(request, "inspect");
  if (limited) return limited;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send { mode: 'ga4' | 'gtm' | 'meta' | 'segment' } with either input (ID or URL) or html (page source)." }, { status: 400 });
  const { mode, input, html, fresh } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const log = (text: string, level: "info" | "ok" | "warn" = "info") => send({ type: "log", text, level });
      const run = async (id: string) => {
        if (mode === "segment") {
          log(`Fetching the public settings of Segment source ${id} from cdn.segment.com`);
          const result = await inspectSegment(id, { fresh });
          const tools = result.model.destinations.filter((item) => item.category !== "Segment").length;
          log(`Decoded ${tools} destination${tools === 1 ? "" : "s"}, ${result.model.trackingPlan.events.length} planned events and ${result.model.rules.length} routing rules`, "ok");
          if (result.changes.length) log(`${result.changes.length} changes since the last read`, "warn");
          send({ type: "result", kind: "segment", id: result.model.writeKey, model: result.model, changes: result.changes });
        } else if (mode === "meta") {
          log(`Fetching the public configuration of pixel ${id} from connect.facebook.net`);
          const result = await inspectMeta(id, { fresh });
          log(`Decoded ${result.model.features.length} pixel features and ${result.model.codelessEvents.length} codeless event rules`, "ok");
          if (result.changes.length) log(`${result.changes.length} changes since the last read`, "warn");
          send({ type: "result", kind: "meta", id: result.model.pixelId, model: result.model, changes: result.changes });
        } else if (mode === "gtm") {
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
      const WANT = { gtm: "GTM", meta: "META", segment: "SEGMENT" } as const;
      const wanted = (item: FoundId) => (mode === "ga4" ? item.kind === "GA4" || item.kind === "GT" : item.kind === WANT[mode]);
      const fromContainers = mode === "meta" ? pixelIdsFromContainers : mode === "segment" ? segmentKeysFromContainers : ga4IdsFromContainers;
      const noun = { ga4: "GA4 Google tag", gtm: "Google Tag Manager container", meta: "Meta Pixel", segment: "Segment source" }[mode];
      const fromFound = async (found: FoundId[], where: string) => {
        let candidates = found.filter(wanted);
        // Many sites load GA4, the Meta Pixel and even Segment through GTM, so look inside the containers when the page has none.
        const containers = found.filter((item) => item.kind === "GTM").map((item) => item.id);
        if (mode !== "gtm" && !candidates.length && containers.length) candidates = await fromContainers(containers, log);
        if (!candidates.length) throw new Error(`No ${noun} was found in ${where}.`);
        send({ type: "found", ids: [...new Set([...found, ...candidates].map((item) => item.id))] });
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
          const kindNoun = { GTM: "a Tag Manager container", GA4: "a GA4 Google tag", GT: "a Google tag", META: "a Meta Pixel ID", SEGMENT: "a Segment write key" }[target.kind];
          const tab = { GTM: "Tag Manager", GA4: "GA4", GT: "GA4", META: "Meta Pixel", SEGMENT: "Segment" }[target.kind];
          if (target.kind === "GTM" && mode !== "gtm") {
            log(`${target.id} is a container — looking for the ${noun} it loads`);
            const ids = await fromContainers([target.id], log);
            if (!ids.length) throw new Error(`No ${noun} is configured in ${target.id}.`);
            send({ type: "found", ids: [target.id, ...ids.map((item) => item.id)] });
            await choose(ids);
          } else if (!wanted({ id: target.id, kind: target.kind, via: "input" })) {
            throw new Error(`${target.id} is ${kindNoun}. Switch to the ${tab} tab to open it.`);
          } else await run(target.id);
        } else {
          log(`Resolving ${new URL(target.url).hostname}`);
          await fromFound(await discoverIds(target.url, log, mode === "segment" ? "SEGMENT" : undefined), "that page");
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
