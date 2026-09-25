import zlib from "node:zlib";
import type { FontFace, FontFileInfo } from "./types";

/**
 * Font parsing: @font-face rules from CSS, and the metadata inside font files (WOFF2, WOFF, TrueType, OpenType).
 * Only the name, OS/2, maxp, cmap and fvar tables are read; glyph outlines are never touched.
 */

// ── Writing systems ──────────────────────────────────────────────────────────────────────────────────────────────

/** Unicode blocks per writing system; `sample` is the number of code points that count as full coverage. */
const SCRIPTS: { name: string; ranges: [number, number][]; sample?: number }[] = [
  { name: "Latin", ranges: [[0x41, 0x5a], [0x61, 0x7a]] },
  { name: "Latin Extended", ranges: [[0xc0, 0x17f]] },
  { name: "Vietnamese", ranges: [[0x1ea0, 0x1ef9]] },
  { name: "Greek", ranges: [[0x391, 0x3c9]] },
  { name: "Cyrillic", ranges: [[0x410, 0x44f]] },
  { name: "Armenian", ranges: [[0x531, 0x587]] },
  { name: "Hebrew", ranges: [[0x5d0, 0x5ea]] },
  { name: "Arabic", ranges: [[0x621, 0x64a]] },
  { name: "Devanagari", ranges: [[0x900, 0x97f]] },
  { name: "Bengali", ranges: [[0x980, 0x9ff]] },
  { name: "Gurmukhi", ranges: [[0xa00, 0xa7f]] },
  { name: "Gujarati", ranges: [[0xa80, 0xaff]] },
  { name: "Tamil", ranges: [[0xb80, 0xbff]] },
  { name: "Telugu", ranges: [[0xc00, 0xc7f]] },
  { name: "Kannada", ranges: [[0xc80, 0xcff]] },
  { name: "Malayalam", ranges: [[0xd00, 0xd7f]] },
  { name: "Thai", ranges: [[0xe01, 0xe5b]] },
  { name: "Georgian", ranges: [[0x10d0, 0x10fa]] },
  { name: "Ethiopic", ranges: [[0x1200, 0x137f]] },
  { name: "Khmer", ranges: [[0x1780, 0x17ff]] },
  { name: "Japanese kana", ranges: [[0x3041, 0x3096], [0x30a1, 0x30fa]] },
  { name: "Chinese (CJK)", ranges: [[0x4e00, 0x9fff]], sample: 2500 },
  { name: "Korean (Hangul)", ranges: [[0xac00, 0xd7a3]], sample: 2350 },
];

/** Google Fonts subset names (from the comments in its CSS) → writing systems. */
const SUBSETS: Record<string, string> = {
  latin: "Latin", "latin-ext": "Latin Extended", vietnamese: "Vietnamese", greek: "Greek", "greek-ext": "Greek", cyrillic: "Cyrillic", "cyrillic-ext": "Cyrillic",
  hebrew: "Hebrew", arabic: "Arabic", devanagari: "Devanagari", bengali: "Bengali", gurmukhi: "Gurmukhi", gujarati: "Gujarati", tamil: "Tamil", telugu: "Telugu",
  kannada: "Kannada", malayalam: "Malayalam", thai: "Thai", georgian: "Georgian", armenian: "Armenian", ethiopic: "Ethiopic", khmer: "Khmer", japanese: "Japanese kana",
  "chinese-simplified": "Chinese (CJK)", "chinese-traditional": "Chinese (CJK)", "chinese-hongkong": "Chinese (CJK)", korean: "Korean (Hangul)", math: "Math", symbols: "Symbols", emoji: "Emoji",
};

type Range = [number, number];

/** Share of each writing system covered by a set of code point ranges. */
export function scriptCoverage(ranges: Range[]): { name: string; coverage: number }[] {
  const output: { name: string; coverage: number }[] = [];
  for (const script of SCRIPTS) {
    let covered = 0;
    let total = 0;
    for (const [start, end] of script.ranges) {
      total += end - start + 1;
      for (const [a, b] of ranges) {
        const lo = Math.max(a, start);
        const hi = Math.min(b, end);
        if (hi >= lo) covered += hi - lo + 1;
      }
    }
    const coverage = Math.min(1, covered / (script.sample ?? total));
    if (coverage >= (script.sample ? 0.2 : 0.5)) output.push({ name: script.name, coverage: Math.round(coverage * 100) / 100 });
  }
  return output;
}

/** Parses a CSS unicode-range value ("U+0000-00FF, U+0131, U+4??") into code point ranges. */
export function parseUnicodeRange(value: string): Range[] {
  const ranges: Range[] = [];
  for (const part of value.split(",")) {
    const match = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part.trim());
    if (!match) continue;
    if (match[1].includes("?")) ranges.push([parseInt(match[1].replace(/\?/g, "0"), 16), parseInt(match[1].replace(/\?/g, "f"), 16)]);
    else ranges.push([parseInt(match[1], 16), parseInt(match[2] ?? match[1], 16)]);
  }
  return ranges.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
}

// ── @font-face ───────────────────────────────────────────────────────────────────────────────────────────────────

const clean = (value: string) => value.trim().replace(/^["']|["']$/g, "").trim();

export function fontSource(url: string, siteHost: string): FontFace["source"] {
  let host = "";
  try { host = new URL(url).hostname; } catch { return "Self-hosted"; }
  if (/fonts\.(?:gstatic|googleapis)\.com$/.test(host)) return "Google Fonts";
  if (/typekit\.net$/.test(host)) return "Adobe Fonts";
  if (/fontshare\.com$/.test(host)) return "Fontshare";
  if (/fonts\.bunny\.net$/.test(host)) return "Bunny Fonts";
  if (/fontawesome\.com$/.test(host)) return "Font Awesome";
  const apex = siteHost.replace(/^www\./, "");
  return host === siteHost || host.endsWith(`.${apex}`) || host === apex ? "Self-hosted" : "Third-party";
}

const ICON_FAMILY = /font ?awesome|material (?:icons|symbols)|icomoon|glyphicons|dashicons|eicons|swiper-icons|slick|remixicon|bootstrap-icons|lucide|feather|ionicons|fontello|elementskit|themify|et-?modules|fa-(?:solid|brands|regular)/i;

/** Every @font-face rule in a stylesheet, grouped by family. `base` resolves relative url()s. */
export function parseFontFaces(css: string, base: string, siteHost: string, into: Map<string, FontFace> = new Map()): Map<string, FontFace> {
  const rule = /@font-face\s*\{([^}]*)\}/gi;
  let match: RegExpExecArray | null;
  while ((match = rule.exec(css))) {
    const body = match[1];
    const prop = (name: string) => new RegExp(`(?:^|;|\\s)${name}\\s*:\\s*([^;]+)`, "i").exec(body)?.[1]?.trim() ?? null;
    const family = clean(prop("font-family") ?? "");
    if (!family) continue;
    const urls: string[] = [];
    const formats: string[] = [];
    for (const src of (prop("src") ?? "").matchAll(/url\(\s*([^)]+?)\s*\)(?:\s*format\(\s*["']?([\w-]+)["']?\s*\))?/gi)) {
      const raw = clean(src[1]);
      if (raw.startsWith("data:")) { formats.push(/font\/(\w+)|application\/(?:x-)?font-(\w+)/.exec(raw)?.slice(1).find(Boolean) ?? "embedded"); continue; }
      try { urls.push(new URL(raw, base).toString()); } catch { /* malformed url() */ }
      const format = src[2] ?? /\.(woff2|woff|ttf|otf|eot)(?:\?|#|$)/i.exec(raw)?.[1];
      if (format) formats.push(format.toLowerCase().replace("ttf", "truetype").replace("otf", "opentype"));
    }
    // Google Fonts labels each subset with a comment right before the rule.
    const comment = /\/\*\s*([\w-]+)\s*\*\/\s*$/.exec(css.slice(Math.max(0, match.index - 60), match.index))?.[1]?.toLowerCase();
    const scripts = comment && SUBSETS[comment] ? [SUBSETS[comment]] : prop("unicode-range") ? scriptCoverage(parseUnicodeRange(prop("unicode-range")!)).map((item) => item.name) : [];
    const key = family.toLowerCase();
    const face: FontFace = into.get(key) ?? { family, source: urls[0] ? fontSource(urls[0], siteHost) : "Self-hosted", weights: [], styles: [], formats: [], display: null, scripts: [], urls: [], file: null, usage: 0, aliases: [] };
    const weight = prop("font-weight")?.replace(/\s+/g, " ");
    if (weight && !face.weights.includes(weight)) face.weights.push(weight);
    const style = prop("font-style")?.split(/\s/)[0];
    if (style && !face.styles.includes(style)) face.styles.push(style);
    for (const format of formats) if (!face.formats.includes(format)) face.formats.push(format);
    for (const script of scripts) if (!face.scripts.includes(script)) face.scripts.push(script);
    for (const url of urls) if (!face.urls.includes(url)) face.urls.push(url);
    face.display ??= prop("font-display");
    into.set(key, face);
  }
  return into;
}

export const isIconFont = (family: string) => ICON_FAMILY.test(family);

const weightOrder = (weight: string) => Number(weight.split(" ")[0]) || (weight === "bold" ? 700 : 400);
export function sortWeights(weights: string[]): string[] {
  return [...weights].sort((a, b) => weightOrder(a) - weightOrder(b));
}

/** The font file to download for a family: prefer WOFF2 and the regular weight. */
export function pickFontUrl(face: FontFace): string | null {
  const byFormat = (url: string) => (/\.woff2(?:\?|#|$)/i.test(url) ? 0 : /\.woff(?:\?|#|$)/i.test(url) ? 1 : /\.(?:ttf|otf)(?:\?|#|$)/i.test(url) ? 2 : /\.eot/i.test(url) ? 9 : 3);
  const candidates = face.urls.filter((url) => byFormat(url) < 9).sort((a, b) => byFormat(a) - byFormat(b));
  return candidates[0] ?? null;
}

// ── Font files ───────────────────────────────────────────────────────────────────────────────────────────────────

const WOFF2_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];
const WANTED = new Set(["name", "OS/2", "maxp", "cmap", "fvar"]);

function readBase128(buf: Buffer, offset: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[offset + i];
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return [value, offset + i + 1];
  }
  throw new Error("Bad UIntBase128");
}

function woff2Tables(buf: Buffer): Map<string, Buffer> {
  const numTables = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  if (buf.toString("latin1", 4, 8) === "ttcf") throw new Error("Font collections are not supported.");
  let offset = 48;
  const entries: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[offset++];
    let tag = WOFF2_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = buf.toString("latin1", offset, offset + 4); offset += 4; }
    const version = flags >> 6;
    let origLength: number;
    [origLength, offset] = readBase128(buf, offset);
    let length = origLength;
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    if (transformed) [length, offset] = readBase128(buf, offset);
    entries.push({ tag, length });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(offset, offset + compressedSize));
  const tables = new Map<string, Buffer>();
  let position = 0;
  for (const entry of entries) {
    if (WANTED.has(entry.tag)) tables.set(entry.tag, data.subarray(position, position + entry.length));
    position += entry.length;
  }
  return tables;
}

function woffTables(buf: Buffer): Map<string, Buffer> {
  const numTables = buf.readUInt16BE(12);
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < numTables; i++) {
    const at = 44 + i * 20;
    const tag = buf.toString("latin1", at, at + 4);
    if (!WANTED.has(tag)) continue;
    const offset = buf.readUInt32BE(at + 4);
    const compLength = buf.readUInt32BE(at + 8);
    const origLength = buf.readUInt32BE(at + 12);
    const raw = buf.subarray(offset, offset + compLength);
    tables.set(tag, compLength < origLength ? zlib.inflateSync(raw) : raw);
  }
  return tables;
}

function sfntTables(buf: Buffer, start = 0): Map<string, Buffer> {
  const numTables = buf.readUInt16BE(start + 4);
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < numTables; i++) {
    const at = start + 12 + i * 16;
    const tag = buf.toString("latin1", at, at + 4);
    if (WANTED.has(tag)) tables.set(tag, buf.subarray(buf.readUInt32BE(at + 8), buf.readUInt32BE(at + 8) + buf.readUInt32BE(at + 12)));
  }
  return tables;
}

function readNames(table: Buffer): Map<number, string> {
  const names = new Map<number, string>();
  const count = table.readUInt16BE(2);
  const storage = table.readUInt16BE(4);
  const ranked: { id: number; rank: number; text: string }[] = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    if (at + 12 > table.length) break;
    const platform = table.readUInt16BE(at);
    const language = table.readUInt16BE(at + 4);
    const id = table.readUInt16BE(at + 6);
    const length = table.readUInt16BE(at + 8);
    const offset = storage + table.readUInt16BE(at + 10);
    const bytes = table.subarray(offset, offset + length);
    let text: string;
    if (platform === 3 || platform === 0) {
      const swapped = Buffer.from(bytes);
      swapped.swap16();
      text = swapped.toString("utf16le");
    } else if (platform === 1) text = bytes.toString("latin1");
    else continue;
    const rank = platform === 3 && language === 0x409 ? 0 : platform === 3 ? 1 : platform === 0 ? 2 : 3;
    ranked.push({ id, rank, text: text.replace(/\0/g, "").trim() });
  }
  for (const item of ranked.sort((a, b) => a.rank - b.rank)) if (item.text && !names.has(item.id)) names.set(item.id, item.text);
  return names;
}

function readCmap(table: Buffer): Range[] {
  const count = table.readUInt16BE(2);
  const subtables: { platform: number; encoding: number; offset: number }[] = [];
  for (let i = 0; i < count; i++) subtables.push({ platform: table.readUInt16BE(4 + i * 8), encoding: table.readUInt16BE(6 + i * 8), offset: table.readUInt32BE(8 + i * 8) });
  const rank = (item: { platform: number; encoding: number; offset: number }) => {
    const format = table.readUInt16BE(item.offset);
    if (format === 12) return 0;
    if (format === 4 && (item.platform === 3 || item.platform === 0)) return 1;
    return 9;
  };
  const best = subtables.filter((item) => item.offset < table.length && rank(item) < 9).sort((a, b) => rank(a) - rank(b))[0];
  if (!best) return [];
  const at = best.offset;
  const ranges: Range[] = [];
  if (table.readUInt16BE(at) === 12) {
    const groups = table.readUInt32BE(at + 12);
    for (let i = 0; i < groups; i++) ranges.push([table.readUInt32BE(at + 16 + i * 12), table.readUInt32BE(at + 20 + i * 12)]);
  } else {
    const segments = table.readUInt16BE(at + 6) / 2;
    const ends = at + 14;
    const starts = ends + segments * 2 + 2;
    for (let i = 0; i < segments; i++) {
      const start = table.readUInt16BE(starts + i * 2);
      const end = table.readUInt16BE(ends + i * 2);
      if (start !== 0xffff) ranges.push([start, end]);
    }
  }
  return ranges;
}

function readAxes(table: Buffer): FontFileInfo["axes"] {
  const offset = table.readUInt16BE(4);
  const count = table.readUInt16BE(8);
  const size = table.readUInt16BE(10);
  const fixed = (at: number) => Math.round((table.readInt32BE(at) / 65536) * 100) / 100;
  const axes: FontFileInfo["axes"] = [];
  for (let i = 0; i < count; i++) {
    const at = offset + i * size;
    axes.push({ tag: table.toString("latin1", at, at + 4), min: fixed(at + 4), default: fixed(at + 8), max: fixed(at + 12) });
  }
  return axes;
}

/** Reads a font file's naming, licensing, coverage and variation data. */
export function parseFontFile(buf: Buffer, url: string): FontFileInfo {
  const signature = buf.toString("latin1", 0, 4);
  const format: FontFileInfo["format"] = signature === "wOF2" ? "woff2" : signature === "wOFF" ? "woff" : signature === "OTTO" ? "opentype" : "truetype";
  let tables: Map<string, Buffer>;
  if (signature === "wOF2") tables = woff2Tables(buf);
  else if (signature === "wOFF") tables = woffTables(buf);
  else if (signature === "ttcf") tables = sfntTables(buf, buf.readUInt32BE(12));
  else if (signature === "OTTO" || signature === "true" || buf.readUInt32BE(0) === 0x00010000) tables = sfntTables(buf);
  else throw new Error("Not a font file.");

  const names = tables.get("name") ? readNames(tables.get("name")!) : new Map<number, string>();
  const os2 = tables.get("OS/2");
  const maxp = tables.get("maxp");
  const cmap = tables.get("cmap");
  const fvar = tables.get("fvar");
  const vendor = os2 && os2.length >= 62 ? os2.toString("latin1", 58, 62).replace(/[\0 ]+$/g, "").trim() : "";
  const text = (id: number) => names.get(id) ?? null;
  return {
    url,
    bytes: buf.length,
    format,
    family: text(16) ?? text(1),
    subfamily: text(17) ?? text(2),
    fullName: text(4),
    version: text(5)?.replace(/^Version\s*/i, "") ?? null,
    foundry: text(8),
    designer: text(9),
    designerUrl: text(12),
    vendorUrl: text(11),
    vendorId: vendor && /^[\x20-\x7e]+$/.test(vendor) ? vendor : null,
    copyright: text(0),
    license: text(13),
    licenseUrl: text(14),
    weightClass: os2 && os2.length >= 6 ? os2.readUInt16BE(4) : null,
    glyphs: maxp && maxp.length >= 6 ? maxp.readUInt16BE(4) : null,
    scripts: cmap ? scriptCoverage(readCmap(cmap)) : [],
    axes: fvar ? readAxes(fvar) : [],
  };
}

/** A few well-known OS/2 vendor IDs, for fonts whose name table leaves the manufacturer blank. */
export const VENDORS: Record<string, string> = {
  GOOG: "Google", ADBE: "Adobe", MONO: "Monotype", MS: "Microsoft", MSFT: "Microsoft", APPL: "Apple", LINO: "Linotype",
  ITFO: "Indian Type Foundry", RSMS: "Rasmus Andersson", IBM: "IBM", PARA: "ParaType", TPTQ: "Typotheque",
};
