"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { brandByName } from "@/lib/brands";
import type { SegmentCategory, SegmentDestination, SegmentReport as Report, SegmentRule } from "@/lib/segment/types";
import { BrandGlyph, Icon, ProductGlyph, formatDateTime } from "./chrome";
import { Row, Section } from "./ga4-report";
import { CodeView } from "./gtm-drawer";
import { ScorePanel } from "./meta-report";
import { Sheet } from "./sheet";

const CATEGORY_ICON: Record<SegmentCategory, string> = {
  Advertising: "campaign", Analytics: "query_stats", "Marketing & CRM": "forward_to_inbox", Personalization: "auto_fix_high",
  "Sales intelligence": "radar", Support: "support_agent", "Data & warehouses": "database", Segment: "hub", Other: "extension",
};
const MODE: Record<SegmentDestination["mode"], { label: string; icon: string; hint: string }> = {
  device: { label: "Browser", icon: "web", hint: "Device mode: the vendor's own script loads in the visitor's browser." },
  cloud: { label: "Server", icon: "cloud", hint: "Cloud mode: Segment forwards events server-side; nothing extra loads in the browser." },
  actions: { label: "Actions", icon: "bolt", hint: "Segment Actions destination: events are mapped to vendor actions by subscription rules." },
};
const JUMPS: Array<[string, string]> = [["stack", "Stack"], ["plan", "Tracking plan"], ["consent", "Consent & rules"], ["library", "Library"], ["advanced", "Advanced"]];

const daysAgo = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)) : null);
const relative = (days: number | null) => (days === null ? "unknown" : days === 0 ? "today" : days === 1 ? "yesterday" : days < 60 ? `${days} days ago` : days < 730 ? `${Math.round(days / 30)} months ago` : `${Math.round(days / 365)} years ago`);

function DestinationGlyph({ destination, size }: { destination: SegmentDestination; size?: "xs" | "md" }) {
  const brand = brandByName(destination.vendor) ?? { name: destination.vendor, letter: destination.vendor.charAt(0).toUpperCase() || "?" };
  return <BrandGlyph brand={brand} size={size} />;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DestinationSheet({ destination, rules, onClose }: { destination: SegmentDestination; rules: SegmentRule[]; onClose: () => void }) {
  const mode = MODE[destination.mode];
  const settings = Object.entries(destination.settings).filter(([, value]) => value !== null && value !== "" && !(Array.isArray(value) && !value.length) && !(typeof value === "object" && value && !Object.keys(value).length));
  return (
    <Sheet title={destination.name} subtitle={`${destination.category} · ${mode.hint}`} onClose={onClose}>
      <div className="dest-hero">
        <DestinationGlyph destination={destination} />
        <div className="dest-badges">
          <span className={`chip mode-${destination.mode}`}><Icon name={mode.icon} /> {mode.label}</span>
          <span className="chip"><Icon name={CATEGORY_ICON[destination.category]} /> {destination.category}</span>
          {destination.version && <span className="chip mono">v{destination.version}</span>}
          {destination.consentCategories.length ? destination.consentCategories.map((category) => <span className="chip chip-ok" key={category}><Icon name="lock" /> {category}</span>) : destination.category !== "Segment" && <span className="chip chip-warn"><Icon name="lock_open" /> No consent category</span>}
        </div>
      </div>
      {destination.ids.length > 0 && (
        <>
          <div className="sublabel">IDs</div>
          <div className="ident">
            {destination.ids.map((id) => (
              <div className="ident-item static" key={`${id.label}-${id.value}`}>
                <span>{id.label}</span><code>{id.value}</code>
                {id.link && <Link className="text-btn small" href={id.link}>Open in TagSpy <Icon name="arrow_forward" className="xs" /></Link>}
              </div>
            ))}
          </div>
        </>
      )}
      {rules.length > 0 && (
        <>
          <div className="sublabel">Rules for this destination</div>
          <div className="rule-list">{rules.map((rule, index) => <RuleItem rule={rule} key={index} compact />)}</div>
        </>
      )}
      {destination.subscriptions.length > 0 && (
        <>
          <div className="sublabel">Action mappings</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Mapping</th><th>Action</th><th>Triggered when</th></tr></thead>
              <tbody>{destination.subscriptions.map((item, index) => (
                <tr key={index} className={item.enabled ? "" : "faint"}><td><strong>{item.name}</strong>{!item.enabled && " (off)"}</td><td className="mono">{item.action}</td><td className="mono">{item.trigger || "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
      <div className="sublabel">Public settings</div>
      {settings.length ? (
        <div className="table-wrap">
          <table className="table">
            <tbody>{settings.map(([key, value]) => <tr key={key}><td className="mono">{key}</td><td className="mono settings-value">{formatValue(value)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <p className="muted small">{destination.mode === "cloud" ? "Cloud-mode destinations keep their settings on Segment's servers, so none are public." : "No public settings."}</p>}
    </Sheet>
  );
}

/** Website → Segment → destinations, grouped by role, with animated data-flow connectors. */
function StackMap({ report, onOpen }: { report: Report; onOpen: (destination: SegmentDestination) => void }) {
  const groups = useMemo(() => {
    const map = new Map<SegmentCategory, SegmentDestination[]>();
    for (const destination of report.destinations.filter((item) => item.category !== "Segment")) map.set(destination.category, [...(map.get(destination.category) ?? []), destination]);
    return [...map].sort((a, b) => b[1].length - a[1].length);
  }, [report.destinations]);
  const unmapped = new Set(report.consent.unmapped);
  return (
    <div className="stack-map" aria-label="Where data flows">
      <div className="stack-node stack-source">
        <span className="glyph g-blue"><Icon name="language" fill /></span>
        <div><strong>This website</strong><small>{report.library.analyticsNext ? "Analytics.js 2.0" : "Analytics.js classic"}{report.library.version ? ` · v${report.library.version}` : ""}</small></div>
      </div>
      <div className="stack-link" aria-hidden="true"><span /></div>
      <div className="stack-node stack-hub">
        <ProductGlyph kind="segment" />
        <div><strong>Segment</strong><small className="mono">{report.library.apiHost}</small></div>
        {report.trackingPlan.enforced && <span className="chip chip-ok"><Icon name="verified" /> Plan enforced</span>}
      </div>
      <div className="stack-link" aria-hidden="true"><span /></div>
      <div className="stack-cats">
        {groups.length ? groups.map(([category, items]) => (
          <div className="stack-cat" key={category}>
            <h4><Icon name={CATEGORY_ICON[category]} className="sm" /> {category}<span>{items.length}</span></h4>
            {items.map((destination) => (
              <button type="button" className="stack-dest" key={destination.name} onClick={() => onOpen(destination)}>
                <DestinationGlyph destination={destination} size="xs" />
                <span className="stack-dest-name">{destination.name}</span>
                {unmapped.has(destination.name) && <Icon name="lock_open" className="xs warn-icon" title="No consent category" />}
                <span className={`mode-pill mode-${destination.mode}`} title={MODE[destination.mode].hint}><Icon name={MODE[destination.mode].icon} className="xs" />{MODE[destination.mode].label}</span>
              </button>
            ))}
          </div>
        )) : <p className="muted small">No destinations are connected to this source.</p>}
      </div>
    </div>
  );
}

function RuleItem({ rule, compact = false }: { rule: SegmentRule; compact?: boolean }) {
  const icon = rule.kind === "consent" ? "shield_lock" : rule.kind === "filter" ? "filter_alt" : "transform";
  return (
    <div className={`rule-item kind-${rule.kind}`}>
      <span className="rule-kind"><Icon name={icon} fill className="sm" /> {rule.action}</span>
      {!compact && <strong>{rule.destination}</strong>}
      <p>{rule.sentence}</p>
      {rule.expression && <code>{rule.expression}</code>}
    </div>
  );
}

export function SegmentReport({ report, onWatch, onShare, onRefresh, refreshing }: { report: Report; onWatch: () => void; onShare: () => void; onRefresh: () => void; refreshing: boolean }) {
  const r = report;
  const [open, setOpen] = useState<SegmentDestination | null>(null);
  const tools = r.destinations.filter((item) => item.category !== "Segment");
  const devices = tools.filter((item) => item.mode === "device").length;
  const planned = r.trackingPlan.events.filter((event) => event.enabled);
  const age = daysAgo(r.lastModified);
  const rulesByDestination = useMemo(() => {
    const map = new Map<string, SegmentRule[]>();
    for (const rule of r.rules) map.set(rule.destination, [...(map.get(rule.destination) ?? []), rule]);
    return map;
  }, [r.rules]);

  return (
    <div className="report">
      <header className="summary">
        <div className="summary-id">
          <ProductGlyph kind="segment" size="large" />
          <div>
            <p className="eyebrow">Segment source</p>
            <h2 className="mono segment-key">{r.writeKey}</h2>
            <p className="muted">Settings published {relative(age)}{r.lastModified ? ` (${r.lastModified.slice(0, 10)})` : ""} · Read {formatDateTime(r.fetchedAt)}</p>
          </div>
        </div>
        <div className="summary-actions">
          <button type="button" className="btn btn-primary" onClick={onWatch}><Icon name="notifications" fill className="sm" /> Follow</button>
          <button type="button" className="btn" onClick={onRefresh} disabled={refreshing} aria-label="Refresh">{refreshing ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" className="sm" />}</button>
          <button type="button" className="btn" onClick={onShare} aria-label="Share"><Icon name="ios_share" className="sm" /></button>
        </div>
      </header>

      <ScorePanel value={r.score.value} checks={r.score.checks} eyebrow="Data governance score"
        headlines={["Well-governed data flow", "Some data flows need guardrails", "Loosely governed data flow"]}
        note="Based on the source's public settings: tracking plan, consent, destinations and endpoint." />

      <section className="insights" aria-label="What we found">
        {r.insights.map((insight, index) => (
          <div className={`insight ${insight.tone}`} key={index}><Icon name={insight.icon} fill className="sm" /><span>{insight.text}</span></div>
        ))}
      </section>

      <div className="tiles">
        <div className="tile"><span>Destinations</span><strong>{tools.length}</strong></div>
        <div className="tile"><span>In the browser</span><strong>{devices}</strong></div>
        <div className="tile"><span>Server-side</span><strong>{tools.length - devices}</strong></div>
        <div className="tile"><span>Planned events</span><strong>{planned.length}</strong></div>
        <div className="tile"><span>Consent groups</span><strong>{r.consent.categories.length}</strong></div>
        <div className="tile"><span>Routing rules</span><strong>{r.rules.length}</strong></div>
      </div>
      <nav className="jumpbar" aria-label="Sections">
        {JUMPS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <section className="group" id="stack" aria-label="Stack">
        <h3 className="group-title">Where data flows</h3>
        <StackMap report={r} onOpen={setOpen} />
      </section>

      <Section id="plan" color="orange" title="Tracking plan">
        <Row icon="rule" title="Unplanned events" description={r.trackingPlan.enforced ? "Blocked: only planned event names reach destinations." : "Allowed: any event name reaches destinations."} toggle={r.trackingPlan.enforced} />
        <Row icon="event_note" title="Planned events" description="Track events allowed by the source's tracking plan." side={<span className="badge badge-primary">{planned.length}</span>}
          chips={planned.length ? <>{planned.slice(0, 4).map((event) => <span className="chip" key={event.name}>{event.name}</span>)}{planned.length > 4 && <span className="more">+{planned.length - 4} more</span>}</> : undefined}>
          {r.trackingPlan.events.length ? (
            <div className="list-rows">
              {r.trackingPlan.events.map((event) => (
                <div className="list-row" key={event.name}>
                  <Icon name={event.enabled ? "check_circle" : "block"} fill className="sm" />
                  <code>{event.name}</code>
                  {event.overrides.map((item) => <span className={`chip ${item.enabled ? "" : "chip-danger"}`} key={item.destination}>{item.enabled ? "→" : "✕"} {item.destination}</span>)}
                  <span className={`right pill-onoff ${event.enabled ? "pill-on" : "pill-off"}`}>{event.enabled ? "ALLOWED" : "BLOCKED"}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted">No tracking plan is attached to this source.</p>}
        </Row>
        <Row icon="badge" title="Identify traits" description={r.trackingPlan.traitsEnforced ? "Only listed traits are kept." : "Listed traits are documented; other traits are also accepted."}
          side={<span className="badge badge-primary">{r.trackingPlan.traits.length}</span>}
          chips={r.trackingPlan.traits.length ? <>{r.trackingPlan.traits.slice(0, 5).map((trait) => <span className="chip mono" key={trait.name}>{trait.name}</span>)}{r.trackingPlan.traits.length > 5 && <span className="more">+{r.trackingPlan.traits.length - 5} more</span>}</> : undefined}>
          <div className="chip-row">{r.trackingPlan.traits.map((trait) => <span className={`chip mono ${trait.enabled ? "" : "chip-danger"}`} key={trait.name}>{trait.name}</span>)}</div>
        </Row>
        {r.trackingPlan.groupTraits.length > 0 && (
          <Row icon="groups" title="Group traits" side={<span className="badge badge-primary">{r.trackingPlan.groupTraits.length}</span>}>
            <div className="chip-row">{r.trackingPlan.groupTraits.map((trait) => <span className="chip mono" key={trait.name}>{trait.name}</span>)}</div>
          </Row>
        )}
      </Section>

      <section className="group" id="consent" aria-label="Consent and rules">
        <h3 className="group-title">Consent &amp; rules</h3>
        {r.consent.categories.length > 0 && (
          <div className="consent-grid">
            {r.consent.categories.map((category) => {
              const gated = tools.filter((item) => item.consentCategories.includes(category));
              return (
                <div className="consent-card" key={category}>
                  <header><Icon name="lock" fill className="sm" /><strong>{category}</strong><span>{gated.length} tool{gated.length === 1 ? "" : "s"}</span></header>
                  <div className="consent-tools">{gated.map((item) => <button type="button" key={item.name} onClick={() => setOpen(item)} title={item.name}><DestinationGlyph destination={item} size="xs" /></button>)}</div>
                </div>
              );
            })}
            {r.consent.unmapped.length > 0 && (
              <div className="consent-card open">
                <header><Icon name="lock_open" fill className="sm" /><strong>No consent category</strong><span>{r.consent.unmapped.length}</span></header>
                <p className="small">{r.consent.unmapped.join(", ")}</p>
              </div>
            )}
          </div>
        )}
        {r.rules.length ? <div className="rule-list">{r.rules.map((rule, index) => <RuleItem rule={rule} key={index} />)}</div> : <div className="note"><Icon name="info" className="sm" /> No consent gates or destination filters are published for this source.</div>}
      </section>

      <Section id="library" color="blue" title="Library and endpoint">
        <Row icon="code_blocks" title="Analytics.js 2.0" description={r.library.version ? `Segment.io integration v${r.library.version}` : "Segment's modern browser library."} toggle={r.library.analyticsNext} />
        <Row icon={r.library.region === "EU" ? "public" : "dns"} title="Event endpoint" description={r.library.region === "Custom" ? "A custom host: a first-party proxy that ad blockers rarely catch." : r.library.region === "EU" ? "Segment's EU region: data stays in the EU." : "Segment's default US endpoint."}
          side={<span className="badge badge-primary mono">{r.library.apiHost}</span>} />
        <Row icon="speed" title="Library metrics" description="Share of page loads that report library health metrics to Segment." side={<span className="badge badge-primary">{r.library.metricsSampleRate === null ? "—" : `${Math.round(r.library.metricsSampleRate * 100)}%`}</span>} />
        <Row icon="auto_mode" title="Auto-instrumentation" description="Segment captures events automatically without code." toggle={r.library.autoInstrumentation} />
        <Row icon="functions" title="Edge function" description="Code that transforms events in the browser before sending." toggle={r.middleware.edgeFunction} />
        <Row icon="tune" title="Source middleware" description={r.middleware.sourceMiddleware.join(", ") || "None"} toggle={r.middleware.sourceMiddleware.length > 0} />
      </Section>

      <Section id="advanced" color="gray" title="Advanced">
        <Row icon="code" title="Raw settings" description={`The complete public settings file (${Object.keys(r.raw).length} blocks).`}>
          <CodeView code={JSON.stringify(r.raw, null, 2)} filename={`segment-${r.writeKey}.json`} label="JSON" />
        </Row>
        <div className="cell">
          <span className="glyph g-gray"><Icon name="open_in_new" fill /></span>
          <span className="cell-text"><strong>Source</strong><small><a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">{r.sourceUrl.replace(/^https:\/\//, "")}</a></small></span>
          <span className="cell-side"><span className="pill pill-on">Public</span></span>
        </div>
      </Section>

      {open && <DestinationSheet destination={open} rules={rulesByDestination.get(open.name) ?? []} onClose={() => setOpen(null)} />}
    </div>
  );
}
