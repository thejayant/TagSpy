import type { SourceMapInfo } from "./types";

/**
 * Public source maps list the original files bundled into a script, including every npm package and, with pnpm, its
 * exact version. Maps can be plain ({ sources, sourcesContent }) or indexed ({ sections: [{ map }] }).
 */

interface RawMap { sources?: string[]; sourcesContent?: (string | null)[]; sections?: { map?: RawMap }[] }

/** The URL a script points to with `//# sourceMappingURL=` (or the SourceMap header), resolved against the script. */
export function sourceMapUrl(script: string, body: string, header: string | null): string | null {
  const reference = header ?? /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/.exec(body.slice(-600))?.[1];
  if (!reference || reference.startsWith("data:")) return null;
  try { return new URL(reference, script).toString(); } catch { return null; }
}

function flatten(map: RawMap, into: { path: string; bytes: number }[] = []) {
  for (const section of map.sections ?? []) if (section.map) flatten(section.map, into);
  (map.sources ?? []).forEach((path, index) => into.push({ path, bytes: map.sourcesContent?.[index]?.length ?? 0 }));
  return into;
}

const PACKAGE = /node_modules\/(?:\.pnpm\/([^/]+)\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/;

export function readSourceMap(script: string, map: string, text: string): SourceMapInfo | null {
  let parsed: RawMap;
  try { parsed = JSON.parse(text); } catch { return null; }
  const files = flatten(parsed);
  if (!files.length) return null;
  const packages = new Map<string, SourceMapInfo["packages"][number]>();
  const own: string[] = [];
  for (const file of files) {
    const path = file.path.replace(/^(?:webpack|turbopack|vite|rollup):\/\/\/?(?:_N_E\/)?/, "").replace(/^(?:\.\.?\/)+/, "").replace(/^\[project\]\//, "");
    const match = PACKAGE.exec(path);
    if (match) {
      const packageName = match[2];
      // pnpm folders look like "gsap@3.12.5" or "@react-three+fiber@8.17.10_react@19.0.0".
      const version = match[1] ? /@(\d+\.\d+\.\d+[\w.-]*?)(?:_|$)/.exec(match[1].replace(/^@/, ""))?.[1] ?? null : null;
      const entry = packages.get(packageName) ?? { name: packageName, version, files: 0, bytes: 0 };
      entry.files++;
      entry.bytes += file.bytes;
      entry.version ??= version;
      packages.set(packageName, entry);
    } else if (!/^(?:\(webpack\)|webpack\/|\u0000|turbopack\/|\[turbopack\]|external )/.test(path) && /\.(?:[jt]sx?|mjs|vue|svelte|astro|css|scss|glsl|frag|vert)$/.test(path)) {
      own.push(path);
    }
  }
  return {
    script,
    map,
    files: files.length,
    packages: [...packages.values()].sort((a, b) => b.bytes - a.bytes || b.files - a.files),
    ownFiles: [...new Set(own)].slice(0, 40),
  };
}
