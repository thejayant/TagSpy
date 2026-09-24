/**
 * Helpers for the compiled JSON that Google embeds in public gtm.js / gtag.js
 * responses (`var data = {...}`). The surrounding JavaScript is never executed.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export interface CompiledResource {
  version?: string;
  macros: JsonObject[];
  tags: JsonObject[];
  predicates: JsonObject[];
  rules: Json[][];
}

export interface CompiledData {
  resource: CompiledResource;
  blob: Record<string, Json>;
  raw: JsonObject;
}

export const isObject = (value: unknown): value is JsonObject => !!value && typeof value === "object" && !Array.isArray(value);
export const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
export const asNumber = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);
export const asBool = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);

/** Finds `var data = {` and returns the balanced JSON object that follows it. */
export function extractDataJson(source: string): JsonObject | null {
  const marker = /\bvar\s+data\s*=\s*\{/.exec(source);
  if (!marker) return null;
  const start = source.indexOf("{", marker.index);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try {
        const parsed: unknown = JSON.parse(source.slice(start, index + 1));
        return isObject(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function parseCompiled(source: string): CompiledData | null {
  const raw = extractDataJson(source);
  if (!raw || !isObject(raw.resource)) return null;
  const resource = raw.resource;
  const list = (value: Json | undefined) => (Array.isArray(value) ? value : []);
  return {
    raw,
    blob: isObject(raw.blob) ? raw.blob : {},
    resource: {
      version: resource.version == null ? undefined : String(resource.version),
      macros: list(resource.macros).filter(isObject),
      tags: list(resource.tags).filter(isObject),
      predicates: list(resource.predicates).filter(isObject),
      rules: list(resource.rules).filter(Array.isArray) as Json[][],
    },
  };
}

/** Converts Google's ["map", k, v, ...] / ["list", ...] encoding into plain JSON. Macro and template references are kept as-is. */
export function decode(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (value[0] === "map") {
    const output: Record<string, unknown> = {};
    for (let index = 1; index + 1 < value.length; index += 2) output[String(value[index])] = decode(value[index + 1]);
    return output;
  }
  if (value[0] === "list") return value.slice(1).map(decode);
  if (value[0] === "macro" || value[0] === "template" || value[0] === "tag" || value[0] === "escape") return value;
  return value.map(decode);
}

export function decodeList(value: unknown): unknown[] {
  const decoded = decode(value);
  return Array.isArray(decoded) ? decoded : [];
}

export function stringList(value: unknown): string[] {
  return decodeList(value).filter((item): item is string => typeof item === "string");
}

/** Every `["macro", n]` index referenced anywhere inside a value. */
export function macroRefs(value: unknown, output = new Set<number>()): Set<number> {
  if (Array.isArray(value)) {
    if (value[0] === "macro" && typeof value[1] === "number") output.add(value[1]);
    for (const item of value) macroRefs(item, output);
  } else if (isObject(value)) {
    for (const item of Object.values(value)) macroRefs(item, output);
  }
  return output;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
