import type { ColorToken, DesignTokens } from "./types";

/** Design tokens read from a site's CSS: palette, type scale, radii, breakpoints and the modern CSS features in use. */

const FEATURES: { name: string; pattern: RegExp; description: string }[] = [
  { name: "Container queries", pattern: /@container\b/, description: "Components adapt to their container instead of the viewport." },
  { name: ":has() selector", pattern: /:has\(/, description: "Parent selectors that style an element by what it contains." },
  { name: "Cascade layers", pattern: /@layer\b/, description: "@layer controls which styles win, as Tailwind v4 does." },
  { name: "Scroll-driven animations", pattern: /animation-timeline|scroll-timeline|view-timeline/, description: "Animations tied to scroll position in pure CSS." },
  { name: "View transitions", pattern: /view-transition-name|@view-transition|::view-transition/, description: "Native animated transitions between states or pages." },
  { name: "@property", pattern: /@property\s+--/, description: "Typed custom properties that can be animated (gradients, angles)." },
  { name: "@starting-style", pattern: /@starting-style/, description: "Entry animations for elements as they appear." },
  { name: "Anchor positioning", pattern: /anchor-name|position-anchor/, description: "Tooltips and popovers tethered to other elements in CSS." },
  { name: "Subgrid", pattern: /\bsubgrid\b/, description: "Nested grids that align to the parent grid tracks." },
  { name: "color-mix()", pattern: /color-mix\(/, description: "Colors blended in CSS, often for tints and hover states." },
  { name: "Wide-gamut color", pattern: /oklch\(|oklab\(|color\(display-p3/, description: "OKLCH or Display P3 colors, brighter than sRGB on modern screens." },
  { name: "Fluid sizing", pattern: /clamp\(/, description: "clamp() scales type and spacing smoothly with the viewport." },
  { name: "Balanced text", pattern: /text-wrap:\s*(?:balance|pretty)/, description: "Headline line breaks balanced by the browser." },
  { name: "Scroll snap", pattern: /scroll-snap-type/, description: "Scrolling that snaps to sections or slides." },
  { name: "Backdrop blur", pattern: /backdrop-filter/, description: "Frosted-glass effects behind translucent layers." },
  { name: "Blend modes", pattern: /mix-blend-mode/, description: "Layers blended like in Photoshop (difference cursors, inverted text)." },
  { name: "Clip paths", pattern: /clip-path\s*:/, description: "Shapes and reveal masks drawn with clip-path." },
  { name: "Masks", pattern: /mask-image|-webkit-mask/, description: "Gradient or image masks for fades and reveals." },
  { name: "3D transforms", pattern: /preserve-3d|perspective\(/, description: "Elements positioned and rotated in 3D space." },
  { name: "Variable font axes", pattern: /font-variation-settings/, description: "Variable font axes set or animated directly." },
  { name: "Dynamic viewport units", pattern: /\b\d*\.?\d+(?:dvh|svh|lvh)\b/, description: "dvh/svh units that handle mobile browser toolbars." },
  { name: "Logical properties", pattern: /(?:margin|padding|inset)-(?:inline|block)(?:-start|-end)?\s*:/, description: "Direction-aware spacing (ready for right-to-left languages)." },
];

const count = <T extends string>(values: T[]) => {
  const map = new Map<T, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map].sort((a, b) => b[1] - a[1]);
};

const hex2 = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Normalizes a CSS color to #rrggbb (or #rrggbbaa when translucent); other syntaxes are kept as written. */
export function normalizeColor(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value.startsWith("#")) {
    let digits = value.slice(1);
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((d) => d + d).join("");
    if (digits.length === 6) return `#${digits}`;
    if (digits.length === 8) return digits.endsWith("ff") ? `#${digits.slice(0, 6)}` : digits.endsWith("00") ? null : `#${digits}`;
    return null;
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(value);
  if (!fn) return value.replace(/\s+/g, " ");
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.some((part) => part.startsWith("var("))) return null;
  const alphaRaw = parts[3];
  const alpha = alphaRaw === undefined ? 1 : alphaRaw.endsWith("%") ? parseFloat(alphaRaw) / 100 : parseFloat(alphaRaw);
  let rgb: [number, number, number];
  if (fn[1].startsWith("rgb")) rgb = parts.slice(0, 3).map((part) => (part.endsWith("%") ? (parseFloat(part) * 255) / 100 : parseFloat(part))) as [number, number, number];
  else rgb = hslToRgb(parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100);
  if (rgb.some((n) => !Number.isFinite(n)) || !Number.isFinite(alpha)) return null;
  if (alpha <= 0) return null;
  return `#${rgb.map(hex2).join("")}${alpha < 1 ? hex2(alpha * 255) : ""}`;
}

function isNeutral(color: string): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/.exec(color);
  if (!match) return false;
  const [r, g, b] = match.slice(1, 4).map((part) => parseInt(part, 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 20;
}

const COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|(?:rgba?|hsla?|oklch|oklab|lch|lab)\([^()]*\)/g;
const PROPERTY = /(--[\w-]+|[a-z-]+)\s*:\s*([^;{}]+)/g;

export function extractTokens(css: string): DesignTokens {
  const colors: string[] = [];
  const colorVariables = new Map<string, string>();
  const fontStacks: string[] = [];
  const fontSizes: string[] = [];
  const fluid = new Set<string>();
  const radii: string[] = [];
  const customProperties = new Set<string>();
  let shadows = 0;
  let transitions = 0;

  for (const [, property, rawValue] of css.matchAll(PROPERTY)) {
    const value = rawValue.replace(/!important/, "").trim();
    if (property.startsWith("--")) customProperties.add(property);
    else if (property === "font-family") fontStacks.push(value.replace(/["']/g, "").replace(/\s*,\s*/g, ", "));
    else if (property === "font-size") fontSizes.push(value);
    else if (property === "border-radius") radii.push(value);
    else if (property === "box-shadow" && value !== "none") shadows++;
    else if (property === "transition" || property === "transition-property") transitions++;
    if (/clamp\(/.test(value) && (property === "font-size" || /--(?:font|text|fs|type|size|heading|h\d)/.test(property))) fluid.add(value);
    // Skip URLs and selectors that happen to look like "a:hover"; colors only come from real declarations.
    if (/url\(|^[a-z-]+\([^)]*$/.test(value)) continue;
    for (const match of value.matchAll(COLOR)) {
      const color = normalizeColor(match[0]);
      if (!color) continue;
      colors.push(color);
      if (property.startsWith("--") && !colorVariables.has(color)) colorVariables.set(color, property);
    }
  }

  const palette: ColorToken[] = count(colors).slice(0, 28).map(([value, total]) => ({ value, count: total, kind: isNeutral(value) ? "neutral" : "color", variable: colorVariables.get(value) ?? null }));
  const breakpoints = new Map<string, number>();
  for (const match of css.matchAll(/\((?:min|max)-width\s*:\s*([\d.]+)(px|em|rem)\)|\(\s*width\s*[<>]=?\s*([\d.]+)(px|em|rem)\)/g)) {
    const number = parseFloat(match[1] ?? match[3]);
    const unit = match[2] ?? match[4];
    const px = unit === "px" ? number : number * 16;
    if (px > 0 && px < 4000) breakpoints.set(`${Math.round(px)}px`, px);
  }

  return {
    colors: palette,
    customProperties: customProperties.size,
    // next/font adds "<Family> Fallback" faces (a metric-adjusted local font); they are not part of the design.
    fontStacks: count(fontStacks).filter(([stack]) => !/^(?:inherit|initial|unset|var\()/.test(stack) && !/^[^,]*fallback(?:,|$)/i.test(stack)).slice(0, 10).map(([stack, total]) => ({ stack, count: total })),
    fontSizes: count(fontSizes).filter(([size]) => !/^(?:inherit|initial|unset|100%|1em)$/.test(size)).slice(0, 16).map(([value, total]) => ({ value, count: total })),
    fluidType: [...fluid].slice(0, 10),
    radii: count(radii).filter(([value]) => value !== "0" && value !== "0px").slice(0, 8).map(([value, total]) => ({ value, count: total })),
    breakpoints: [...breakpoints].sort((a, b) => a[1] - b[1]).map(([label]) => label).slice(0, 14),
    shadows,
    darkMode: /prefers-color-scheme\s*:\s*dark|\.dark[\s.:{>]|\[data-(?:theme|mode|color-scheme)=["']?dark|color-scheme\s*:\s*(?:light\s+dark|dark)/.test(css),
    features: FEATURES.filter((feature) => feature.pattern.test(css)).map(({ name, description }) => ({ name, description })),
    keyframes: (css.match(/@(?:-webkit-)?keyframes\s/g) ?? []).length,
    transitions,
  };
}
