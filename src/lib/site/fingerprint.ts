import type { SiteReport } from "./types";

/**
 * The part of a Site DNA report that is stored as a snapshot and diffed for redesign alerts. Only stable, meaningful
 * facts: technologies (without implied ones, and with pre-release suffixes dropped from versions), typefaces, the
 * main palette and hosting. Scan timings, file sizes and runtime-only findings are left out so an unchanged site never
 * looks changed.
 */
export interface SiteFingerprint {
  fetchedAt: string;
  address: string;
  techs: { name: string; category: string; version: string | null }[];
  fonts: string[];
  colors: string[];
  hosting: string[];
}

/**
 * Stable key for a scanned site: host (lower case, no www) and path, without scheme, query or trailing slash
 * ("rockstargames.com/VI"). The path keeps its case because paths can be case-sensitive.
 */
export function siteAddress(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}`;
}

export function fingerprint(report: SiteReport): SiteFingerprint {
  return {
    fetchedAt: report.fetchedAt,
    address: siteAddress(report.finalUrl),
    techs: report.techs
      .filter((tech) => !tech.implied && tech.seenAt !== "runtime")
      .map((tech) => ({ name: tech.name, category: tech.category, version: tech.version ? tech.version.replace(/^(\d+(?:\.\d+){0,2}).*$/, "$1") : null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    fonts: [...new Set(report.fonts.map((face) => face.file?.family ?? face.family))].sort(),
    colors: report.tokens.colors.slice(0, 12).map((color) => color.value).sort(),
    hosting: report.techs.filter((tech) => ["Hosting", "CDN"].includes(tech.category)).map((tech) => tech.name).sort(),
  };
}
