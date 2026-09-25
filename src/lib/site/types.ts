/** Everything the Site DNA scan finds about a website, built from its public HTML, CSS, JavaScript, fonts, headers and DNS. */

export type TechCategory =
  | "Framework" | "Meta-framework" | "Build tool" | "Language" | "CMS" | "Site builder" | "Headless CMS" | "E-commerce"
  | "UI framework" | "CSS" | "Component library" | "Icons" | "JavaScript library"
  | "Animation" | "Smooth scroll" | "Page transitions" | "3D & WebGL" | "Vector animation" | "Creative coding" | "Carousel"
  | "Hosting" | "CDN" | "Web server" | "Backend" | "Security"
  | "Analytics" | "Tag management" | "Advertising" | "Monitoring" | "Consent" | "Customer support" | "Auth" | "Payments" | "Search"
  | "Media" | "Font service";

export interface Evidence {
  /** Where it was seen: "HTML", "header server", "cookie PHPSESSID", "/assets/index-abc.js" … */
  where: string;
  /** The matched text with a little context. */
  match: string;
}

export interface Tech {
  name: string;
  category: TechCategory;
  version: string | null;
  /** high: an unambiguous marker; medium: a strong hint; low: inferred (e.g. a backend from a cookie name). */
  confidence: "high" | "medium" | "low";
  description: string;
  website: string | null;
  color: string | null;
  evidence: Evidence[];
  /** Detected only because another technology implies it (Next.js → React). */
  implied: boolean;
  /** After a deep scan: seen in the static files, only while the page ran, or both. */
  seenAt?: "static" | "runtime" | "both";
}

export interface FontFileInfo {
  url: string;
  bytes: number;
  format: "woff2" | "woff" | "truetype" | "opentype";
  family: string | null;
  subfamily: string | null;
  fullName: string | null;
  version: string | null;
  foundry: string | null;
  designer: string | null;
  designerUrl: string | null;
  vendorUrl: string | null;
  vendorId: string | null;
  copyright: string | null;
  license: string | null;
  licenseUrl: string | null;
  weightClass: number | null;
  glyphs: number | null;
  /** Writing systems the font's character map covers, with the share of each block covered. */
  scripts: { name: string; coverage: number }[];
  /** Variable font axes (wght, wdth, opsz, custom). Empty for static fonts. */
  axes: { tag: string; min: number; default: number; max: number }[];
}

export interface FontFace {
  family: string;
  source: "Google Fonts" | "Adobe Fonts" | "Fontshare" | "Bunny Fonts" | "Font Awesome" | "Self-hosted" | "Third-party";
  weights: string[];
  styles: string[];
  formats: string[];
  display: string | null;
  /** Writing systems declared by unicode-range or Google Fonts subset comments. */
  scripts: string[];
  urls: string[];
  /** Metadata read from one of the family's font files. */
  file: FontFileInfo | null;
  /** How many CSS rules use this family in font-family. */
  usage: number;
  /** Other @font-face family names that load the same typeface (e.g. "ArtDecoBold", "ArtDecoMedium"). */
  aliases: string[];
}

export interface ColorToken { value: string; count: number; kind: "neutral" | "color"; variable: string | null }

export interface DesignTokens {
  colors: ColorToken[];
  customProperties: number;
  fontStacks: { stack: string; count: number }[];
  fontSizes: { value: string; count: number }[];
  fluidType: string[];
  radii: { value: string; count: number }[];
  breakpoints: string[];
  shadows: number;
  darkMode: boolean;
  /** Modern CSS features in use (container queries, :has(), scroll-driven animations …). */
  features: { name: string; description: string }[];
  keyframes: number;
  transitions: number;
}

export interface ExperienceSignal { key: string; label: string; description: string; on: boolean; detail: string | null }

export interface SecurityHeader { name: string; label: string; present: boolean; value: string | null }

export interface Infrastructure {
  finalUrl: string;
  status: number;
  server: string | null;
  poweredBy: string | null;
  httpVersion: "HTTP/3" | "HTTP/2 or older";
  compression: string | null;
  cacheControl: string | null;
  securityHeaders: SecurityHeader[];
  cookies: { name: string; hint: string | null }[];
  /** Third-party hosts allowed by the Content-Security-Policy. */
  cspHosts: string[];
  tls: { issuer: string | null; validTo: string | null; protocol: string | null; altNames: number } | null;
  ips: string[];
}

export interface DnsInfo {
  domain: string;
  nameservers: string[];
  dnsProvider: string | null;
  mx: string[];
  mailProvider: string | null;
  /** Services the domain proved ownership to with TXT records. */
  verifiedServices: string[];
  /** Senders allowed by SPF (include: mechanisms), named when known. */
  emailSenders: string[];
  dmarc: string | null;
}

export interface Asset {
  url: string;
  kind: "script" | "style" | "font" | "sourcemap";
  bytes: number;
  firstParty: boolean;
  /** Technologies detected in this file. */
  techs: string[];
}

export interface SourceMapInfo {
  script: string;
  map: string;
  files: number;
  /** npm packages bundled into the script, with bytes of original source when the map embeds it. */
  packages: { name: string; version: string | null; files: number; bytes: number }[];
  /** Sample of the site's own (non node_modules) source file paths. */
  ownFiles: string[];
}

export interface PageMeta {
  title: string | null;
  description: string | null;
  lang: string | null;
  hreflang: string[];
  canonical: string | null;
  generator: string | null;
  themeColor: string | null;
  ogImage: string | null;
  robots: string | null;
  jsonLdTypes: string[];
  manifest: boolean;
  /** Tracking IDs found in the page (GTM-, G-, Meta pixels, Segment keys) for the other TagSpy tabs. */
  trackingIds: string[];
}

export interface Insight { tone: "good" | "info" | "warn"; icon: string; text: string }

export interface SiteReport {
  url: string;
  finalUrl: string;
  host: string;
  fetchedAt: string;
  durationMs: number;
  /** "url" when the site was fetched, "html" when the user pasted page source. */
  source: "url" | "html";
  /** One-paragraph summary of how the site is built. */
  recipe: string;
  techs: Tech[];
  wordpress: { theme: string | null; plugins: string[] } | null;
  experience: ExperienceSignal[];
  shaders: number;
  fonts: FontFace[];
  tokens: DesignTokens;
  infra: Infrastructure | null;
  dns: DnsInfo | null;
  assets: Asset[];
  sourceMaps: SourceMapInfo[];
  /** failed: files that could not be read for transient reasons (timeouts, 403/429/5xx); such a scan is incomplete. */
  totals: { html: number; js: number; css: number; fonts: number; scripts: number; styles: number; skipped: number; failed: number };
  page: PageMeta;
  insights: Insight[];
  limits: string[];
  /** Present after a deep scan (the page rendered in a real browser). */
  runtime?: RuntimeReport | null;
}

// ── Deep scan (v3) ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface RuntimeGlobal {
  /** Signature name when it maps to one ("GSAP", "three.js", "React"), else a descriptive name. */
  name: string;
  version: string | null;
  detail: string | null;
}

export interface RuntimeAsset { url: string; kind: string; bytes: number }

export interface RuntimeReport {
  finalUrl: string;
  provider: "cloudflare" | "local" | "serverless" | "remote";
  startedAt: string;
  durationMs: number;
  /** True when the time budget ran out and some probes were skipped. */
  partial: boolean;
  /** Set when a bot-protection page answered instead of the site. */
  blocked: string | null;
  globals: RuntimeGlobal[];
  network: {
    requests: number;
    transferBytes: number;
    byType: { type: string; count: number; bytes: number }[];
    thirdParty: { host: string; count: number; bytes: number }[];
    /** Scripts fetched while the page ran that are not in the initial HTML (lazy chunks). */
    lazyScripts: number;
    assets3d: RuntimeAsset[];
    media: RuntimeAsset[];
    vector: RuntimeAsset[];
    /** Requests refused by the private-network guard. */
    blocked: number;
  };
  fonts: { family: string; weight: string; style: string }[];
  typeScale: { selector: string; family: string; size: string; weight: string; lineHeight: string; letterSpacing: string; transform: string }[];
  webgl: { contexts: { type: string; width: number; height: number }[]; shaders: number; shaderSamples: string[]; drawCalls: number; webgpu: boolean };
  animations: { total: number; running: number; css: number; transitions: number; scripted: number; names: string[] };
  /** container: the element that scrolls when the document itself does not (e.g. a smooth-scroll wrapper). */
  scroll: { library: string | null; container: string | null; virtual: boolean; wheelListeners: number; pageHeight: number };
  reducedMotion: { tested: boolean; normalRunning: number; reducedRunning: number; smoothScrollDisabled: boolean | null; respects: boolean | null };
  vitals: { fcp: number | null; lcp: number | null; cls: number | null; longTasks: number; totalBlockingTime: number; domContentLoaded: number | null; load: number | null; jsHeapMB: number | null };
  screenshots: { label: string; src: string }[];
}
