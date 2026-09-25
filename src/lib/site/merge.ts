import { CATEGORY_ORDER } from "./detect";
import { insights, recipe } from "./scan";
import { SIGNATURES } from "./signatures";
import type { ExperienceSignal, Insight, RuntimeReport, SiteReport, Tech } from "./types";

/**
 * Folds a deep scan into the static report. Runtime evidence confirms or adds technologies (versions read from live
 * globals win over versions guessed from bundles), updates the motion signals with what the page actually did, and
 * rewrites the summary. The static report is never mutated.
 */

const bySignature = new Map(SIGNATURES.map((signature) => [signature.name, signature]));
const AUDIO = /\.(?:mp3|wav|ogg|m4a|aac)(?:\?|$)/i;
const VIDEO = /\.(?:mp4|webm|mov|m3u8)(?:\?|$)/i;

/** Runtime globals as technologies, using the signature's category and description when one exists. */
function globalsAsTechs(runtime: RuntimeReport): Tech[] {
  return runtime.globals.map((global) => {
    const signature = bySignature.get(global.name);
    return {
      name: global.name,
      category: signature?.category ?? "JavaScript library",
      version: global.version,
      confidence: "high" as const,
      description: signature?.description ?? "Found on the running page.",
      website: signature?.website ?? null,
      color: signature?.color ?? null,
      evidence: [{ where: "runtime global", match: [global.name, global.version, global.detail].filter(Boolean).join(" · ") }],
      implied: false,
    };
  });
}

export function mergeRuntime(report: SiteReport, runtime: RuntimeReport, runtimeTechs: Tech[], runtimeScripts: string[]): SiteReport {
  const merged = new Map<string, Tech>(report.techs.map((tech) => [tech.name, { ...tech, evidence: [...tech.evidence], seenAt: "static" as const }]));
  const globals = globalsAsTechs(runtime);
  const globalNames = new Set(globals.map((tech) => tech.name));
  for (const [index, found] of [...globals, ...runtimeTechs].entries()) {
    const fromGlobal = index < globals.length;
    const existing = merged.get(found.name);
    const evidence = found.evidence.map((item) => ({ where: item.where.startsWith("runtime") ? item.where : `runtime · ${item.where}`, match: item.match }));
    if (!existing) { merged.set(found.name, { ...found, evidence: evidence.slice(0, 4), seenAt: "runtime" }); continue; }
    if (existing.seenAt === "static" && !found.implied) existing.seenAt = "both";
    // A version read from the live library beats one matched in minified code, and once set by a global it sticks:
    // bundles can carry other copies of the same version string (R3F ships its own React reconciler, for example).
    if (fromGlobal && found.version) existing.version = found.version;
    else if (!globalNames.has(found.name)) existing.version ??= found.version;
    if (existing.implied && !found.implied) { existing.implied = false; existing.confidence = found.confidence; }
    for (const item of evidence) if (existing.evidence.length < 7 && !existing.evidence.some((known) => known.match === item.match)) existing.evidence.push(item);
  }
  const rank = { high: 0, medium: 1, low: 2 };
  const techs = [...merged.values()].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || rank[a.confidence] - rank[b.confidence] || a.name.localeCompare(b.name));

  const staticScripts = new Set(report.assets.filter((asset) => asset.kind === "script").map((asset) => asset.url.split("#")[0]));
  const network = { ...runtime.network, lazyScripts: runtimeScripts.filter((url) => !staticScripts.has(url)).length };
  const next: SiteReport = { ...report, techs, runtime: { ...runtime, network }, experience: updateExperience(report.experience, techs, { ...runtime, network }) };
  next.recipe = recipe(next);
  next.insights = [...runtimeInsights(next.runtime!), ...insights(next).filter((item) => item.icon !== "animation" || !runtime.reducedMotion.tested)];
  next.limits = [
    "The deep scan rendered the page once in a headless browser at 1280×800 with software WebGL, so frame rates and GPU timings are not representative.",
    ...(runtime.partial ? ["The deep scan ran out of time before every probe finished; some runtime details are missing."] : []),
    ...report.limits.filter((line) => !line.startsWith("Only what the first page load serves")),
  ];
  return next;
}

function updateExperience(signals: ExperienceSignal[], techs: Tech[], runtime: RuntimeReport): ExperienceSignal[] {
  const names = (...categories: Tech["category"][]) => techs.filter((tech) => categories.includes(tech.category)).map((tech) => tech.name).join(", ") || null;
  const media = runtime.network.media.map((item) => item.url);
  const output = signals.map((signal) => {
    const copy = { ...signal };
    switch (signal.key) {
      case "smooth": if (runtime.scroll.library || names("Smooth scroll")) { copy.on = true; copy.detail = runtime.scroll.library ?? names("Smooth scroll"); } break;
      case "timeline": if (names("Animation")) { copy.on = true; copy.detail = names("Animation"); } break;
      case "transitions": if (names("Page transitions")) { copy.on = true; copy.detail = names("Page transitions"); } break;
      case "vector": if (names("Vector animation") || runtime.network.vector.length) { copy.on = true; copy.detail = names("Vector animation") ?? `${runtime.network.vector.length} animation files`; } break;
      case "webgl": if (runtime.webgl.contexts.length) { copy.on = true; copy.detail = `${runtime.webgl.contexts.length} live context${runtime.webgl.contexts.length === 1 ? "" : "s"} (${[...new Set(runtime.webgl.contexts.map((item) => item.type))].join(", ")})${names("3D & WebGL") ? ` · ${names("3D & WebGL")}` : ""}`; } break;
      case "shaders": if (runtime.webgl.shaders) { copy.on = true; copy.detail = `${runtime.webgl.shaders} shaders compiled at runtime, ${runtime.webgl.drawCalls.toLocaleString()} draw calls while scanning`; } break;
      case "video": if (media.some((url) => VIDEO.test(url))) { copy.on = true; copy.detail = `${media.filter((url) => VIDEO.test(url)).length} video file(s)`; } break;
      case "reduced": if (runtime.reducedMotion.tested && runtime.reducedMotion.respects !== null) { copy.on = runtime.reducedMotion.respects; copy.detail = `Tested: ${runtime.reducedMotion.normalRunning} running animations normally, ${runtime.reducedMotion.reducedRunning} with reduce motion on${runtime.reducedMotion.smoothScrollDisabled === null ? "" : runtime.reducedMotion.smoothScrollDisabled ? "; smooth scrolling switched off" : "; smooth scrolling stays on"}`; } break;
    }
    return copy;
  });
  const audio = media.filter((url) => AUDIO.test(url));
  if (audio.length && !output.some((signal) => signal.key === "audio")) output.splice(output.length - 1, 0, { key: "audio", label: "Sound design", description: "The page loads sound effects or music (hover, click or ambient audio).", on: true, detail: `${audio.length} audio file${audio.length === 1 ? "" : "s"}` });
  if (runtime.scroll.virtual) output.splice(1, 0, { key: "virtual", label: "Virtual scrolling", description: "The page does not scroll natively: wheel input drives a transformed layer (scroll-jacking).", on: true, detail: `${runtime.scroll.wheelListeners} wheel listeners` });
  return output;
}

function runtimeInsights(runtime: RuntimeReport): Insight[] {
  const output: Insight[] = [];
  if (runtime.blocked) output.push({ tone: "warn", icon: "shield_lock", text: `Deep scan: ${runtime.blocked}` });
  const lcp = runtime.vitals.lcp;
  if (lcp !== null) output.push({ tone: lcp <= 2500 ? "good" : lcp <= 4000 ? "info" : "warn", icon: "speed", text: `Largest contentful paint ${(lcp / 1000).toFixed(1)} s in the scan browser (lab value, not field data).` });
  if (runtime.network.lazyScripts) output.push({ tone: "info", icon: "bolt", text: `${runtime.network.lazyScripts} scripts loaded only while the page ran, which a static read cannot see.` });
  if (runtime.webgl.contexts.length) output.push({ tone: "info", icon: "view_in_ar", text: `${runtime.webgl.contexts.length} WebGL context${runtime.webgl.contexts.length === 1 ? "" : "s"}, ${runtime.webgl.shaders} shaders compiled, ${runtime.webgl.drawCalls.toLocaleString()} draw calls during the scan.` });
  if (runtime.reducedMotion.tested && runtime.reducedMotion.respects !== null) output.push({ tone: runtime.reducedMotion.respects ? "good" : "warn", icon: "accessibility_new", text: runtime.reducedMotion.respects ? "Verified: turning on “reduce motion” calms the page down." : "Verified: the page keeps animating with “reduce motion” turned on." });
  if (runtime.network.assets3d.length) output.push({ tone: "info", icon: "deployed_code", text: `${runtime.network.assets3d.length} 3D asset${runtime.network.assets3d.length === 1 ? "" : "s"} (${[...new Set(runtime.network.assets3d.map((item) => item.kind))].join(", ")}) loaded at runtime.` });
  return output;
}
