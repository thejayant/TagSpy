"use client";

import { useMemo, useState } from "react";
import { brandByName } from "@/lib/brands";
import { formatBytes } from "@/lib/compiled";
import { TECH_ICONS } from "@/lib/site/tech-icons";
import type { ColorToken, FontFace, SiteReport as Report, RuntimeReport, Tech, TechCategory } from "@/lib/site/types";
import { BrandGlyph, Icon, RelatedLinks, formatDateTime, SoonBadge } from "./chrome";
import { Steps, type InspectState } from "./inspect";
import type { DeepStatus } from "./site-app";
import { Row, Section } from "./ga4-report";
import { CodeView } from "./gtm-drawer";
import { Sheet } from "./sheet";
import { useToast } from "./toast";

/** Categories grouped into the sections of the stack board. */
export const GROUPS: { title: string; icon: string; categories: TechCategory[] }[] = [
  { title: "Framework & build", icon: "deployed_code", categories: ["Meta-framework", "Framework", "Build tool", "Language", "JavaScript library"] },
  { title: "CMS & builders", icon: "dashboard_customize", categories: ["Site builder", "CMS", "Headless CMS", "E-commerce"] },
  { title: "Design system", icon: "palette", categories: ["UI framework", "Component library", "CSS", "Icons", "Carousel"] },
  { title: "Motion & 3D", icon: "animation", categories: ["Animation", "Smooth scroll", "Page transitions", "3D & WebGL", "Vector animation", "Creative coding"] },
  { title: "Hosting & backend", icon: "dns", categories: ["Hosting", "CDN", "Web server", "Backend", "Security", "Auth", "Payments", "Search", "Media", "Font service"] },
  { title: "Marketing & analytics", icon: "query_stats", categories: ["Tag management", "Analytics", "Advertising", "Monitoring", "Consent", "Customer support"] },
];
const JUMPS: Array<[string, string]> = [["stack", "Stack"], ["motion", "Motion"], ["type", "Typography"], ["design", "Design tokens"], ["infra", "Infrastructure"], ["page", "Page"]];
const CONFIDENCE = { high: "Confirmed", medium: "Likely", low: "Inferred" } as const;

/** A Material Symbol per category, for technologies without an open-licensed brand mark. */
const CATEGORY_ICON: Record<TechCategory, string> = {
  "Meta-framework": "layers", Framework: "deployed_code", "Build tool": "build", Language: "code", CMS: "article", "Site builder": "dashboard_customize",
  "Headless CMS": "api", "E-commerce": "shopping_cart", "UI framework": "palette", CSS: "format_paint", "Component library": "widgets", Icons: "interests",
  "JavaScript library": "javascript", Animation: "animation", "Smooth scroll": "swipe_vertical", "Page transitions": "transition_slide", "3D & WebGL": "view_in_ar",
  "Vector animation": "gesture", "Creative coding": "brush", Carousel: "view_carousel", Hosting: "cloud", CDN: "public", "Web server": "dns", Backend: "terminal",
  Security: "shield", Analytics: "query_stats", "Tag management": "sell", Advertising: "campaign", Monitoring: "monitor_heart", Consent: "cookie",
  "Customer support": "support_agent", Auth: "key", Payments: "payments", Search: "search", Media: "perm_media", "Font service": "match_case",
};

/** The technology's mark: a generated brand icon, else a TagSpy vendor logo, else its category icon. */
export function TechGlyph({ tech, size = "md" }: { tech: Pick<Tech, "name" | "category">; size?: "xs" | "md" }) {
  const file = TECH_ICONS[tech.name];
  const xs = size === "xs" ? " xs" : "";
  if (file) {
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG; next/image adds nothing here
    return <span className={`glyph brand${xs}`} title={tech.name} role="img" aria-label={tech.name}><img src={`/tech-icons/${file}`} alt="" loading="lazy" decoding="async" /></span>;
  }
  const brand = brandByName(tech.name);
  if (brand && "logo" in brand) return <BrandGlyph brand={brand} size={size} />;
  return <span className={`glyph g-indigo${xs}`} title={tech.name} role="img" aria-label={tech.name}><Icon name={CATEGORY_ICON[tech.category] ?? "extension"} fill /></span>;
}

const shortVersion = (version: string) => version.replace(/^(\d+\.\d+\.\d+)[-+].*$/, "$1");
const kb = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);

function TechSheet({ tech, files, onClose }: { tech: Tech; files: string[]; onClose: () => void }) {
  return (
    <Sheet title={tech.name} subtitle={`${tech.category} · ${CONFIDENCE[tech.confidence]}`} onClose={onClose}>
      <div className="dest-hero">
        <TechGlyph tech={tech} />
        <div className="dest-badges">
          <span className="chip">{tech.category}</span>
          {tech.version && <span className="chip mono">v{tech.version}</span>}
          <span className={`chip ${tech.confidence === "high" ? "chip-ok" : tech.confidence === "medium" ? "" : "chip-warn"}`}><Icon name={tech.confidence === "high" ? "verified" : "help"} /> {CONFIDENCE[tech.confidence]}</span>
        </div>
      </div>
      <p className="muted">{tech.description}</p>
      {tech.website && <p><a className="text-btn" href={tech.website} target="_blank" rel="noopener noreferrer">{tech.website.replace(/^https:\/\//, "")} <Icon name="north_east" className="xs" /></a></p>}
      <div className="sublabel">Evidence</div>
      <div className="evidence-list">
        {tech.evidence.map((item, index) => (
          <div className="evidence" key={index}>
            <span>{item.where}</span>
            <code>{item.match}</code>
          </div>
        ))}
      </div>
      {files.length > 0 && (
        <>
          <div className="sublabel">Found in</div>
          <div className="chip-row">{files.slice(0, 12).map((file) => <span className="chip mono" key={file}>{file}</span>)}{files.length > 12 && <span className="more">+{files.length - 12} more</span>}</div>
        </>
      )}
    </Sheet>
  );
}

function StackBoard({ techs, onOpen }: { techs: Tech[]; onOpen: (tech: Tech) => void }) {
  const groups = GROUPS.map((group) => ({ ...group, items: techs.filter((tech) => group.categories.includes(tech.category)) })).filter((group) => group.items.length);
  if (!groups.length) return <div className="note"><Icon name="info" className="sm" /> No known technologies were recognized in the files we could read.</div>;
  return (
    <div className="stack-cats tech-board">
      {groups.map((group) => (
        <div className="stack-cat" key={group.title}>
          <h4><Icon name={group.icon} className="sm" /> {group.title}<span>{group.items.length}</span></h4>
          {group.items.map((tech) => (
            <button type="button" className="stack-dest" key={tech.name} onClick={() => onOpen(tech)} title={`${tech.category}: ${tech.description}`}>
              <TechGlyph tech={tech} size="xs" />
              <span className="stack-dest-name">{tech.name}</span>
              {tech.version && <span className="mode-pill mono">{shortVersion(tech.version)}</span>}
              {tech.seenAt === "runtime" && <span className="conf conf-runtime" title="Only seen while the page ran (deep scan)">runtime</span>}
              {tech.confidence !== "high" && <span className={`conf conf-${tech.confidence}`} title={CONFIDENCE[tech.confidence]}>{CONFIDENCE[tech.confidence]}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function FontCard({ face }: { face: FontFace }) {
  const file = face.file;
  const license = file?.licenseUrl ?? (file?.license && /^https?:\/\//.test(file.license) ? file.license : null);
  return (
    <article className="font-card">
      <header>
        <div>
          <h4>{face.family}</h4>
          {file?.family && file.family !== face.family && <small>File name: {file.fullName ?? file.family}</small>}
          {face.aliases.length > 0 && <small>Also declared as {face.aliases.slice(0, 4).join(", ")}{face.aliases.length > 4 ? ` +${face.aliases.length - 4}` : ""}</small>}
        </div>
        <span className={`chip ${face.source === "Self-hosted" ? "chip-ok" : ""}`}>{face.source}</span>
      </header>
      <p className="font-specimen" aria-hidden="true">Aa Bb Gg 0123</p>
      <dl className="font-facts">
        {face.weights.length > 0 && <><dt>Weights</dt><dd>{face.weights.join(", ")}</dd></>}
        {face.styles.length > 0 && <><dt>Styles</dt><dd>{face.styles.join(", ")}</dd></>}
        {file?.axes.length ? <><dt>Variable axes</dt><dd>{file.axes.map((axis) => `${axis.tag} ${axis.min}–${axis.max}`).join(" · ")}</dd></> : null}
        {face.scripts.length > 0 && <><dt>Languages</dt><dd>{face.scripts.join(", ")}</dd></>}
        {file?.foundry && <><dt>Foundry</dt><dd>{file.vendorUrl ? <a href={file.vendorUrl.startsWith("http") ? file.vendorUrl : `https://${file.vendorUrl}`} target="_blank" rel="noopener noreferrer">{file.foundry}</a> : file.foundry}</dd></>}
        {file?.designer && <><dt>Designer</dt><dd>{file.designerUrl ? <a href={file.designerUrl.startsWith("http") ? file.designerUrl : `https://${file.designerUrl}`} target="_blank" rel="noopener noreferrer">{file.designer}</a> : file.designer}</dd></>}
        {file?.version && <><dt>Version</dt><dd>{file.version.slice(0, 60)}</dd></>}
        {(license || file?.license) && <><dt>License</dt><dd>{license ? <a href={license} target="_blank" rel="noopener noreferrer">{license.replace(/^https?:\/\//, "").slice(0, 48)}</a> : <span title={file!.license!}>{file!.license!.slice(0, 90)}{file!.license!.length > 90 ? "…" : ""}</span>}</dd></>}
        {file && <><dt>File</dt><dd>{file.format.toUpperCase()} · {formatBytes(file.bytes)}{file.glyphs ? ` · ${file.glyphs.toLocaleString()} glyphs` : ""}</dd></>}
        {face.display && <><dt>font-display</dt><dd className="mono">{face.display}</dd></>}
      </dl>
      {file?.copyright && <p className="font-copy">{file.copyright.slice(0, 160)}</p>}
    </article>
  );
}

function Swatches({ colors }: { colors: ColorToken[] }) {
  const toast = useToast();
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); toast("Copied", value); } catch { /* clipboard blocked */ } };
  return (
    <div className="swatches">
      {colors.map((color) => (
        <button type="button" className="swatch" key={color.value} onClick={() => copy(color.value)} title={`Used ${color.count}× — click to copy`}>
          <span className="swatch-chip" style={{ background: color.value }} />
          <span className="swatch-text"><code>{color.value}</code>{color.variable && <small>{color.variable}</small>}</span>
        </button>
      ))}
    </div>
  );
}

export interface DeepScan {
  status: DeepStatus | null;
  state: InspectState<Report>;
  run: () => void;
  cancel: () => void;
}

/** Explains, runs and reports progress of a deep scan (the page rendered in a headless browser). */
export function DeepScanCard({ deep, runtime }: { deep: DeepScan; runtime: Report["runtime"] }) {
  const running = deep.state.status === "running";
  const status = deep.status;
  const used = status ? status.remaining <= 0 : false;
  return (
    <section className={`deep-card ${runtime ? "done" : ""}`} aria-label="Deep scan">
      <div className="deep-head">
        <span className="glyph g-purple"><Icon name={runtime ? "verified" : "memory"} fill /></span>
        <div>
          <strong>{runtime ? "Deep scan complete" : "Deep scan"}</strong>
          <small>
            {runtime
              ? `Rendered in a real browser (${runtime.provider}) in ${(runtime.durationMs / 1000).toFixed(1)} s${runtime.partial ? " · partial: time ran out" : ""}. Runtime findings are merged below and marked “runtime”.`
              : "Renders the page in a headless browser, scrolls it and runs it again with reduce-motion on: finds lazy-loaded libraries, live versions, WebGL, loaded fonts, Web Vitals and screenshots. Takes 20–50 s."}
          </small>
        </div>
        {running ? <button type="button" className="btn" onClick={deep.cancel}>Cancel</button>
          : <button type="button" className="btn btn-primary" onClick={deep.run} disabled={!status?.enabled || used} title={status?.reason ?? (used ? "No deep scans left for this visit" : undefined)}><Icon name={runtime ? "refresh" : "play_arrow"} className="sm" /> {runtime ? "Run again" : "Run deep scan"}</button>}
      </div>
      {status && !status.enabled && <p className="deep-note"><Icon name="info" className="xs" /> {status.reason}</p>}
      {status?.enabled && <p className="deep-note"><Icon name={used ? "block" : "confirmation_number"} className="xs" /> {used ? `You've used all ${status.perVisit} deep scans for this visit. They reset when you start a new browser session.` : `${status.remaining} of ${status.perVisit} deep scans left for this visit.`}</p>}
      {(running || deep.state.status === "error") && <Steps logs={deep.state.logs} running={running} progress={deep.state.progress} onCancel={deep.cancel} />}
      {deep.state.status === "error" && <div className="alert-card" role="alert"><Icon name="error" fill /><span>{deep.state.error}</span></div>}
    </section>
  );
}

function CompareForm({ onCompare }: { onCompare: (other: string) => void }) {
  const [other, setOther] = useState("");
  return (
    <form className="compare-form" onSubmit={(event) => { event.preventDefault(); if (other.trim()) onCompare(other.trim()); }}>
      <Icon name="compare_arrows" className="sm" />
      <label className="visually-hidden" htmlFor="compare-with">Compare with another website</label>
      <input id="compare-with" value={other} onChange={(event) => setOther(event.target.value)} placeholder="Compare with another site…" autoComplete="off" spellCheck={false} />
      <button className="btn" disabled={!other.trim()}>Compare</button>
    </form>
  );
}

export function SiteReport({ report, onShare, onRefresh, refreshing, deep, onWatch, onHistory, onCompare }: {
  report: Report; onShare?: () => void; onRefresh?: () => void; refreshing: boolean;
  deep?: DeepScan; onWatch?: () => void; onHistory?: () => void; onCompare?: (other: string) => void;
}) {
  const r = report;
  const [open, setOpen] = useState<Tech | null>(null);
  const filesByTech = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const asset of r.assets) for (const name of asset.techs) map.set(name, [...(map.get(name) ?? []), asset.url.replace(/^https?:\/\/[^/]+/, "")]);
    return map;
  }, [r.assets]);
  const packages = [...new Map(r.sourceMaps.flatMap((map) => map.packages).map((item) => [item.name, item])).values()];
  const colors = r.tokens.colors.filter((item) => item.kind === "color");
  const neutrals = r.tokens.colors.filter((item) => item.kind === "neutral");
  const hosting = r.techs.filter((tech) => ["Hosting", "CDN", "Web server"].includes(tech.category));
  const backend = r.techs.filter((tech) => ["Backend", "Language"].includes(tech.category) && !["TypeScript", "WebAssembly"].includes(tech.name));
  const related = r.page.trackingIds.map((id) => ({ kind: /^GTM-/.test(id) ? "gtm" as const : /^GT?-/.test(id) ? "ga4" as const : /^\d+$/.test(id) ? "meta" as const : "segment" as const, id }));
  const onSignals = r.experience.filter((item) => item.on && item.key !== "reduced").length;
  const download = () => {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `site-dna-${r.host}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="report">
      <header className="summary">
        <div className="summary-id">
          <span className="app-icon g-blue"><Icon name="travel_explore" fill /></span>
          <div>
            <p className="eyebrow">Site DNA</p>
            <h2 className="site-host">{r.host}</h2>
            <p className="muted">{r.page.title ? `${r.page.title} · ` : ""}Scanned {formatDateTime(r.fetchedAt)} in {(r.durationMs / 1000).toFixed(1)} s</p>
          </div>
        </div>
        <div className="summary-actions">
          {onWatch && <button type="button" className="btn btn-primary" onClick={onWatch}><Icon name="notifications" fill className="sm" /> Follow <SoonBadge /></button>}
          {onHistory && <button type="button" className="btn" onClick={onHistory} aria-label="Change history"><Icon name="history" className="sm" /></button>}
          <button type="button" className="btn" onClick={download} aria-label="Download JSON"><Icon name="download" className="sm" /></button>
          {onRefresh && <button type="button" className="btn" onClick={onRefresh} disabled={refreshing} aria-label="Rescan">{refreshing ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" className="sm" />}</button>}
          {onShare && <button type="button" className="btn" onClick={onShare} aria-label="Share"><Icon name="ios_share" className="sm" /></button>}
        </div>
      </header>

      <section className="recipe" aria-label="How it's built">
        <span className="recipe-kicker"><Icon name="auto_awesome" fill className="sm" /> How it&apos;s built</span>
        <p>{r.recipe}</p>
      </section>

      {deep && <DeepScanCard deep={deep} runtime={r.runtime} />}
      {onCompare && <CompareForm onCompare={onCompare} />}

      {r.insights.length > 0 && (
        <section className="insights" aria-label="What we found">
          {r.insights.map((insight, index) => <div className={`insight ${insight.tone}`} key={index}><Icon name={insight.icon} fill className="sm" /><span>{insight.text}</span></div>)}
        </section>
      )}

      <div className="tiles">
        <div className="tile"><span>Technologies</span><strong>{r.techs.length}</strong></div>
        <div className="tile"><span>Motion signals</span><strong>{onSignals}</strong></div>
        <div className="tile"><span>Font families</span><strong>{r.fonts.length}</strong></div>
        <div className="tile"><span>JavaScript</span><strong>{kb(r.totals.js)}</strong></div>
        <div className="tile"><span>CSS</span><strong>{kb(r.totals.css)}</strong></div>
        {r.runtime ? <div className="tile"><span>LCP (lab)</span><strong>{r.runtime.vitals.lcp === null ? "—" : `${(r.runtime.vitals.lcp / 1000).toFixed(1)} s`}</strong></div>
          : <div className="tile"><span>Shaders</span><strong>{r.shaders}</strong></div>}
      </div>
      <nav className="jumpbar" aria-label="Sections">
        {(r.runtime ? [["runtime", "Runtime"] as [string, string], ...JUMPS] : JUMPS).map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      {r.runtime && <RuntimeSection runtime={r.runtime} />}

      <section className="group" id="stack" aria-label="Technology stack">
        <h3 className="group-title">Technology stack</h3>
        <StackBoard techs={r.techs} onOpen={setOpen} />
        {r.wordpress && (
          <div className="list list-pad wp-box">
            <div className="kv-line"><strong>WordPress theme</strong> <code>{r.wordpress.theme ?? "unknown"}</code></div>
            {r.wordpress.plugins.length > 0 && <div className="chip-row">{r.wordpress.plugins.map((plugin) => <span className="chip mono" key={plugin}>{plugin}</span>)}</div>}
          </div>
        )}
        {packages.length > 0 && (
          <div className="list list-pad wp-box">
            <div className="kv-line"><strong>npm packages</strong> <span className="muted small">listed in the site&apos;s public source maps</span></div>
            <div className="chip-row">{packages.slice(0, 60).map((item) => <span className="chip mono" key={item.name}>{item.name}{item.version ? `@${item.version}` : ""}</span>)}{packages.length > 60 && <span className="more">+{packages.length - 60} more</span>}</div>
          </div>
        )}
      </section>

      <Section id="motion" color="purple" title="Motion & experience">
        {r.experience.map((signal) => (
          <Row key={signal.key} icon={SIGNAL_ICON[signal.key] ?? "motion_mode"} title={signal.label} description={signal.detail ? `${signal.description} ${signal.detail}.` : signal.description} toggle={signal.on} />
        ))}
      </Section>

      <section className="group" id="type" aria-label="Typography">
        <h3 className="group-title">Typography</h3>
        {r.fonts.length ? <div className="font-grid">{r.fonts.map((face) => <FontCard face={face} key={face.family} />)}</div> : <div className="note"><Icon name="info" className="sm" /> No @font-face rules were found in the stylesheets we could read. The site may use system fonts, or load its fonts from JavaScript.</div>}
        {(r.tokens.fontStacks.length > 0 || r.tokens.fontSizes.length > 0) && (
          <div className="list list-pad type-scale">
            {r.tokens.fontStacks.length > 0 && (
              <>
                <div className="sublabel">font-family stacks</div>
                <div className="list-rows">{r.tokens.fontStacks.map((item) => <div className="list-row" key={item.stack}><code>{item.stack}</code><span className="right muted">{item.count}×</span></div>)}</div>
              </>
            )}
            {r.tokens.fontSizes.length > 0 && (
              <>
                <div className="sublabel">Type scale</div>
                <div className="chip-row">{r.tokens.fontSizes.map((item) => <span className="chip mono" key={item.value} title={`${item.count}×`}>{item.value}</span>)}</div>
              </>
            )}
            {r.tokens.fluidType.length > 0 && (
              <>
                <div className="sublabel">Fluid type (clamp)</div>
                <div className="chip-row">{r.tokens.fluidType.map((value) => <span className="chip mono" key={value}>{value}</span>)}</div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="group" id="design" aria-label="Design tokens">
        <h3 className="group-title">Design tokens</h3>
        <div className="list list-pad">
          {colors.length > 0 && <><div className="sublabel">Colors</div><Swatches colors={colors} /></>}
          {neutrals.length > 0 && <><div className="sublabel">Neutrals</div><Swatches colors={neutrals} /></>}
          {!r.tokens.colors.length && <p className="muted">No colors found in the CSS we could read.</p>}
          <div className="token-facts">
            <div><span>Custom properties</span><strong>{r.tokens.customProperties}</strong></div>
            <div><span>Keyframe animations</span><strong>{r.tokens.keyframes}</strong></div>
            <div><span>Transitions</span><strong>{r.tokens.transitions}</strong></div>
            <div><span>Box shadows</span><strong>{r.tokens.shadows}</strong></div>
            <div><span>Dark mode</span><strong>{r.tokens.darkMode ? "Yes" : "No"}</strong></div>
          </div>
          {r.tokens.radii.length > 0 && <><div className="sublabel">Corner radii</div><div className="chip-row">{r.tokens.radii.map((item) => <span className="chip mono" key={item.value}>{item.value}</span>)}</div></>}
          {r.tokens.breakpoints.length > 0 && <><div className="sublabel">Breakpoints</div><div className="chip-row">{r.tokens.breakpoints.map((value) => <span className="chip mono" key={value}>{value}</span>)}</div></>}
          {r.tokens.features.length > 0 && (
            <>
              <div className="sublabel">Modern CSS in use</div>
              <div className="feature-grid">{r.tokens.features.map((feature) => <div className="feature-item" key={feature.name}><strong>{feature.name}</strong><small>{feature.description}</small></div>)}</div>
            </>
          )}
        </div>
      </section>

      <Section id="infra" color="teal" title="Infrastructure">
        <Row icon="cloud" title="Hosting & delivery" description={hosting.length ? hosting.map((tech) => tech.name).join(", ") : "No hosting provider identified from the response headers."}
          chips={r.infra?.server ? <span className="chip mono">server: {r.infra.server}</span> : undefined} />
        <Row icon="code" title="Server side" description={backend.length ? `${backend.map((tech) => tech.name).join(", ")}${backend.some((tech) => tech.confidence !== "high") ? " — inferred from headers, cookies and the framework." : "."}` : "Nothing in the headers or cookies reveals the backend language."}
          chips={r.infra?.poweredBy ? <span className="chip mono">x-powered-by: {r.infra.poweredBy}</span> : undefined} />
        {r.infra && (
          <>
            <Row icon="bolt" title="Protocol & compression" description={`${r.infra.httpVersion}${r.infra.compression ? ` · ${r.infra.compression} compression` : " · no compression reported"}`} chips={r.infra.cacheControl ? <span className="chip mono">cache-control: {r.infra.cacheControl.slice(0, 60)}</span> : undefined} />
            <Row icon="lock" title="TLS certificate" description={r.infra.tls ? `${r.infra.tls.issuer ?? "Unknown issuer"}${r.infra.tls.validTo ? ` · valid until ${r.infra.tls.validTo.slice(0, 10)}` : ""}${r.infra.tls.protocol ? ` · ${r.infra.tls.protocol}` : ""}` : "Not read."}
              chips={r.infra.ips.length ? <>{r.infra.ips.slice(0, 3).map((ip) => <span className="chip mono" key={ip}>{ip}</span>)}</> : undefined} />
            <Row icon="shield" title="Security headers" description={`${r.infra.securityHeaders.filter((item) => item.present).length} of ${r.infra.securityHeaders.length} set`}
              chips={<>{r.infra.securityHeaders.map((item) => <span className={`chip ${item.present ? "chip-ok" : "chip-muted"}`} key={item.name}><Icon name={item.present ? "check" : "close"} /> {item.label}</span>)}</>}>
              <div className="table-wrap">
                <table className="table"><tbody>{r.infra.securityHeaders.map((item) => <tr key={item.name}><td className="mono">{item.name}</td><td className="mono settings-value">{item.value ?? "—"}</td></tr>)}</tbody></table>
              </div>
            </Row>
            {r.infra.cookies.length > 0 && (
              <Row icon="cookie" title="Cookies set by the page" description={r.infra.cookies.map((cookie) => cookie.hint).filter(Boolean).join(", ") || "Set on the first response."} side={<span className="badge badge-primary">{r.infra.cookies.length}</span>}>
                <div className="list-rows">{r.infra.cookies.map((cookie) => <div className="list-row" key={cookie.name}><code>{cookie.name}</code><span className="right muted">{cookie.hint ?? ""}</span></div>)}</div>
              </Row>
            )}
            {r.infra.cspHosts.length > 0 && (
              <Row icon="policy" title="Third parties allowed by the CSP" description="Hosts the Content-Security-Policy lets the page talk to: a list of the services it uses." side={<span className="badge badge-primary">{r.infra.cspHosts.length}</span>}>
                <div className="chip-row">{r.infra.cspHosts.map((host) => <span className="chip mono" key={host}>{host}</span>)}</div>
              </Row>
            )}
          </>
        )}
        {r.dns && (
          <>
            <Row icon="dns" title="DNS" description={r.dns.dnsProvider ? `Hosted at ${r.dns.dnsProvider}` : "DNS provider not recognized"} chips={<>{r.dns.nameservers.slice(0, 3).map((ns) => <span className="chip mono" key={ns}>{ns}</span>)}</>} />
            <Row icon="mail" title="Email" description={`${r.dns.mailProvider ? `Mail handled by ${r.dns.mailProvider}` : r.dns.mx.length ? "Mail server not recognized" : "No MX records"}${r.dns.dmarc ? ` · DMARC ${r.dns.dmarc}` : ""}`}
              chips={r.dns.emailSenders.length ? <><span>Sends via:</span>{r.dns.emailSenders.slice(0, 5).map((sender) => <span className="chip" key={sender}>{sender}</span>)}</> : undefined} />
            {r.dns.verifiedServices.length > 0 && (
              <Row icon="verified" title="Services verified on the domain" description="Tools the company proved domain ownership to with DNS TXT records." side={<span className="badge badge-primary">{r.dns.verifiedServices.length}</span>}
                chips={<>{r.dns.verifiedServices.slice(0, 6).map((name) => <span className="chip" key={name}>{name}</span>)}{r.dns.verifiedServices.length > 6 && <span className="more">+{r.dns.verifiedServices.length - 6} more</span>}</>}>
                <div className="chip-row">{r.dns.verifiedServices.map((name) => <span className="chip" key={name}>{name}</span>)}</div>
              </Row>
            )}
          </>
        )}
      </Section>

      <Section id="page" color="gray" title="Page">
        <Row icon="title" title="Title" description={r.page.title ?? "—"} />
        {r.page.description && <Row icon="description" title="Description" description={r.page.description} />}
        <Row icon="translate" title="Language" description={r.page.lang ?? "Not declared on <html lang>"} chips={r.page.hreflang.length ? <><span>hreflang:</span>{r.page.hreflang.slice(0, 8).map((lang) => <span className="chip mono" key={lang}>{lang}</span>)}{r.page.hreflang.length > 8 && <span className="more">+{r.page.hreflang.length - 8}</span>}</> : undefined} />
        {r.page.generator && <Row icon="build" title="Generator" description={r.page.generator} />}
        {r.page.jsonLdTypes.length > 0 && <Row icon="data_object" title="Structured data" description="schema.org types in JSON-LD" chips={<>{r.page.jsonLdTypes.map((type) => <span className="chip" key={type}>{type}</span>)}</>} />}
        {r.page.themeColor && <Row icon="format_color_fill" title="Theme color" description={r.page.themeColor} side={<span className="swatch-chip small" style={{ background: r.page.themeColor }} />} />}
        {r.page.canonical && <Row icon="link" title="Canonical URL" description={r.page.canonical} />}
        <Row icon="install_mobile" title="Web app manifest" toggle={r.page.manifest} />
        <Row icon="code" title="Raw report" description="The complete scan as JSON.">
          <CodeView code={JSON.stringify(r, null, 2)} filename={`site-dna-${r.host}.json`} label="JSON" />
        </Row>
      </Section>
      <RelatedLinks title="Tags on this site" items={related} />

      <div className="note limits"><Icon name="info" className="sm" /><div>{r.limits.map((line) => <p key={line}>{line}</p>)}</div></div>

      {open && <TechSheet tech={open} files={filesByTech.get(open.name) ?? []} onClose={() => setOpen(null)} />}
    </div>
  );
}

const ms = (value: number | null) => (value === null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`);
const vitalTone = (value: number | null, good: number, poor: number) => (value === null ? "" : value <= good ? "good" : value <= poor ? "fair" : "poor");
const fileName = (url: string) => { try { const path = new URL(url).pathname; return decodeURIComponent(path.split("/").filter(Boolean).pop() ?? path); } catch { return url; } };

/** What the page did while running in the scan browser. */
function RuntimeSection({ runtime: rt }: { runtime: RuntimeReport }) {
  const [shot, setShot] = useState<number | null>(null);
  const assets = [...rt.network.assets3d, ...rt.network.vector, ...rt.network.media];
  const loadedFamilies = [...new Map(rt.fonts.map((font) => [font.family, font])).keys()];
  return (
    <section className="group" id="runtime" aria-label="Runtime">
      <h3 className="group-title">Runtime (deep scan)</h3>
      {rt.blocked && <div className="alert-card" role="alert"><Icon name="shield_lock" fill /><span>{rt.blocked}</span></div>}
      {rt.screenshots.filter((item) => item.src).length > 0 && (
        <div className="filmstrip">
          {rt.screenshots.filter((item) => item.src).map((item, index) => (
            <button type="button" key={item.label} onClick={() => setShot(index)} title={`${item.label}: click to enlarge`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL screenshot from the scan */}
              <img src={item.src} alt={`${item.label} of the scanned page`} loading="lazy" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="vitals">
        <div className={`vital ${vitalTone(rt.vitals.fcp, 1800, 3000)}`}><span>First paint</span><strong>{ms(rt.vitals.fcp)}</strong></div>
        <div className={`vital ${vitalTone(rt.vitals.lcp, 2500, 4000)}`}><span>Largest paint</span><strong>{ms(rt.vitals.lcp)}</strong></div>
        <div className={`vital ${vitalTone(rt.vitals.cls === null ? null : rt.vitals.cls * 1000, 100, 250)}`}><span>Layout shift</span><strong>{rt.vitals.cls ?? "—"}</strong></div>
        <div className={`vital ${vitalTone(rt.vitals.totalBlockingTime, 200, 600)}`}><span>Blocking time</span><strong>{ms(rt.vitals.totalBlockingTime)}</strong></div>
        <div className="vital"><span>Requests</span><strong>{rt.network.requests}</strong></div>
        <div className="vital"><span>Transferred</span><strong>{formatBytes(rt.network.transferBytes)}</strong></div>
      </div>
      <p className="muted small">Lab values from one load in a headless browser with software rendering: useful to compare sites, not a substitute for field data.</p>

      <div className="list runtime-list">
        <Row icon="data_object" title="Libraries on the running page" description={rt.globals.length ? "Read from live globals and the React renderer registry, so versions are exact." : "No known library exposed a global."}
          chips={rt.globals.length ? <>{rt.globals.slice(0, 6).map((item) => <span className="chip" key={item.name}>{item.name}{item.version ? ` ${item.version.replace(/^(\d+\.\d+\.\d+)[-+].*$/, "$1")}` : ""}</span>)}{rt.globals.length > 6 && <span className="more">+{rt.globals.length - 6}</span>}</> : undefined}>
          <div className="list-rows">{rt.globals.map((item) => <div className="list-row" key={item.name}><strong>{item.name}</strong><code>{item.version ?? "—"}</code><span className="right muted">{item.detail ?? ""}</span></div>)}</div>
        </Row>
        <Row icon="view_in_ar" title="WebGL" description={rt.webgl.contexts.length ? `${rt.webgl.contexts.length} context${rt.webgl.contexts.length === 1 ? "" : "s"} · ${rt.webgl.shaders} shaders compiled · ${rt.webgl.drawCalls.toLocaleString()} draw calls${rt.webgl.webgpu ? " · WebGPU requested" : ""}` : "No WebGL or WebGPU context was created."} toggle={rt.webgl.contexts.length > 0}>
          {rt.webgl.contexts.length > 0 && <div className="chip-row">{rt.webgl.contexts.map((context, index) => <span className="chip mono" key={index}>{context.type} {context.width}×{context.height}</span>)}</div>}
          {rt.webgl.shaderSamples.length > 0 && <CodeView code={rt.webgl.shaderSamples.join("\n\n// ─────────────\n\n")} filename={`shaders-sample.glsl`} label="GLSL" />}
        </Row>
        <Row icon="animation" title="Animations" description={`${rt.animations.running} running · ${rt.animations.css} CSS animations · ${rt.animations.transitions} transitions · ${rt.animations.scripted} scripted (Web Animations API)`}
          chips={rt.animations.names.length ? <>{rt.animations.names.slice(0, 5).map((name) => <span className="chip mono" key={name}>{name}</span>)}</> : undefined} />
        <Row icon="swipe_vertical" title="Scrolling" description={rt.scroll.virtual ? `Virtual: the page does not scroll natively; ${rt.scroll.wheelListeners} wheel listeners drive a transformed layer (scroll-jacking).` : rt.scroll.container ? `Scrolls inside a container element (${rt.scroll.container})${rt.scroll.library ? `, smoothed by ${rt.scroll.library}` : ""}.` : rt.scroll.library ? `${rt.scroll.library} smooths native scrolling.` : "Native browser scrolling."}
          chips={<span className="chip mono">page height {rt.scroll.pageHeight.toLocaleString()} px</span>} />
        <Row icon="accessibility_new" title="Reduced motion (tested)" toggle={rt.reducedMotion.respects ?? undefined}
          description={!rt.reducedMotion.tested ? "Not tested: not enough time left in the scan." : rt.reducedMotion.respects === null ? "Nothing was animating, so there was nothing to reduce." : `${rt.reducedMotion.normalRunning} running animations normally, ${rt.reducedMotion.reducedRunning} with “reduce motion” on${rt.reducedMotion.smoothScrollDisabled === null ? "" : rt.reducedMotion.smoothScrollDisabled ? "; smooth scrolling turns off" : "; smooth scrolling stays on"}.`} />
        <Row icon="match_case" title="Rendered typography" description={loadedFamilies.length ? `Fonts actually loaded: ${loadedFamilies.join(", ")}` : "No web fonts finished loading."}>
          {rt.typeScale.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Element</th><th>Font</th><th>Size / line</th><th>Weight</th><th>Tracking</th></tr></thead>
                <tbody>{rt.typeScale.map((item) => <tr key={item.selector}><td className="mono">{item.selector}</td><td>{item.family.split(",")[0].replace(/["']/g, "")}{item.transform !== "none" ? <span className="muted"> · {item.transform}</span> : null}</td><td className="mono">{item.size} / {item.lineHeight}</td><td className="mono">{item.weight}</td><td className="mono">{item.letterSpacing}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Row>
        <Row icon="lan" title="Network" description={`${rt.network.requests} requests, ${formatBytes(rt.network.transferBytes)} transferred${rt.network.lazyScripts ? `, ${rt.network.lazyScripts} scripts the static scan did not see` : ""}${rt.network.blocked ? `, ${rt.network.blocked} blocked by the private-network guard` : ""}.`}
          chips={<>{rt.network.byType.slice(0, 4).map((item) => <span className="chip" key={item.type}>{item.type} {formatBytes(item.bytes)}</span>)}</>}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Type</th><th>Requests</th><th>Transferred</th></tr></thead>
              <tbody>{rt.network.byType.map((item) => <tr key={item.type}><td>{item.type}</td><td>{item.count}</td><td>{formatBytes(item.bytes)}</td></tr>)}</tbody>
            </table>
          </div>
          {rt.network.thirdParty.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Third-party host</th><th>Requests</th><th>Transferred</th></tr></thead>
                <tbody>{rt.network.thirdParty.map((item) => <tr key={item.host}><td className="mono">{item.host}</td><td>{item.count}</td><td>{formatBytes(item.bytes)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Row>
        {assets.length > 0 && (
          <Row icon="deployed_code" title="3D, animation and media files" description={`${rt.network.assets3d.length} 3D, ${rt.network.vector.length} Rive/Lottie, ${rt.network.media.length} audio/video (media is listed, not downloaded).`}>
            <div className="list-rows">{assets.map((item) => <div className="list-row" key={item.url}><span className="chip mono">{item.kind}</span><code title={item.url}>{fileName(item.url)}</code><span className="right muted">{item.bytes ? formatBytes(item.bytes) : ""}</span></div>)}</div>
          </Row>
        )}
      </div>
      {shot !== null && rt.screenshots[shot] && (
        <Sheet title={rt.screenshots[shot].label} subtitle="Captured by the deep scan at 1280×800" wide onClose={() => setShot(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL screenshot from the scan */}
          <img className="shot-full" src={rt.screenshots[shot].src} alt={`${rt.screenshots[shot].label} of the scanned page`} />
        </Sheet>
      )}
    </section>
  );
}

const SIGNAL_ICON: Record<string, string> = {
  audio: "graphic_eq", virtual: "swap_vert",
  smooth: "swipe_vertical", timeline: "timeline", scroll: "unfold_more_double", webgl: "view_in_ar", shaders: "blur_on", transitions: "transition_slide",
  vector: "gesture", split: "text_fields", cursor: "arrow_selector_tool", video: "movie", fluid: "format_size", reduced: "accessibility_new",
};
