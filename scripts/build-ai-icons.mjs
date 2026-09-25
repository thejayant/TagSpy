// Generates public/ai-icons/*.svg for the AI Website Detector's tool marks.
// Sources (both CC0): @iconify-json/logos (full-color marks, preferred) and simple-icons (single-color marks).
// Tools without an open-licensed mark (Base44, Emergent, Anything, Same, Tempo) get a lettered tile in the UI.
// Run: node scripts/build-ai-icons.mjs   (after adding a tool icon in src/lib/ai/signatures.ts)
import fs from "node:fs";
import path from "node:path";
import * as simpleIcons from "simple-icons";

const logos = JSON.parse(fs.readFileSync("node_modules/@iconify-json/logos/icons.json", "utf8"));
const bySlug = new Map(Object.values(simpleIcons).filter((icon) => icon && typeof icon === "object" && icon.path).map((icon) => [icon.slug, icon]));

/** File name → candidates, best first. */
const ICONS = {
  "lovable.svg": ["logos:lovable-icon", "logos:lovable"],
  "bolt.svg": ["logos:bolt-icon", "logos:bolt"],
  "v0.svg": ["si:v0", "logos:v0"],
  "replit.svg": ["logos:replit-icon", "si:replit"],
  "ai-studio.svg": ["logos:google-aistudio", "si:googlegemini"],
  "claude.svg": ["logos:claude-icon", "si:claude"],
  "openai.svg": ["logos:openai-icon"],
  "cursor.svg": ["logos:cursor-icon", "si:cursor"],
  "windsurf.svg": ["si:windsurf"],
  "copilot.svg": ["logos:github-copilot", "si:githubcopilot"],
  "gemini.svg": ["logos:google-gemini-icon", "si:googlegemini"],
};

function fromLogos(slug) {
  const key = logos.aliases?.[slug]?.parent ?? slug;
  const icon = logos.icons[key];
  if (!icon) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${icon.width ?? logos.width ?? 256} ${icon.height ?? logos.height ?? 256}">${icon.body}</svg>`;
}

function fromSimple(slug) {
  const icon = bySlug.get(slug);
  return icon ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#${icon.hex}" d="${icon.path}"/></svg>` : null;
}

const outDir = "public/ai-icons";
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const [file, candidates] of Object.entries(ICONS)) {
  const svg = candidates.map((candidate) => { const [set, slug] = candidate.split(":"); return set === "logos" ? fromLogos(slug) : fromSimple(slug); }).find(Boolean);
  if (!svg) { console.log(`missing: ${file}`); continue; }
  fs.writeFileSync(path.join(outDir, file), svg);
  console.log(`${file} ← ${candidates.find((candidate) => { const [set, slug] = candidate.split(":"); return set === "logos" ? fromLogos(slug) : fromSimple(slug); })}`);
}
