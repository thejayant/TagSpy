"use client";

import { createContext, useContext, useState } from "react";
import type { EventRule, Ga4Report as Report, Toggle } from "@/lib/ga4/types";
import { Icon, ProductGlyph, Switch, formatDateTime } from "./chrome";
import { Sheet } from "./sheet";

const SectionColor = createContext("blue");

/** A Settings-style cell. Rows with details open them in a sheet instead of expanding inline. */
export function Row({ icon, title, description, side, chips, children, toggle }: {
  icon: string;
  title: string;
  description?: React.ReactNode;
  side?: React.ReactNode;
  chips?: React.ReactNode;
  children?: React.ReactNode;
  toggle?: boolean | null;
  defaultOpen?: boolean;
}) {
  const color = useContext(SectionColor);
  const [open, setOpen] = useState(false);
  const detail = !!children;
  const content = (
    <>
      <span className={`glyph g-${color}`}><Icon name={icon} fill /></span>
      <span className="cell-text">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
        {chips && <span className="cell-chips">{chips}</span>}
      </span>
      <span className="cell-side">
        {side}
        {typeof toggle === "boolean" && <Switch on={toggle} label={title} />}
        {detail && <Icon name="chevron_right" className="chev" />}
      </span>
    </>
  );
  return (
    <>
      {detail
        ? <button type="button" className="cell" aria-haspopup="dialog" onClick={() => setOpen(true)}>{content}</button>
        : <div className="cell">{content}</div>}
      {open && <Sheet title={title} subtitle={description} onClose={() => setOpen(false)}>{children}</Sheet>}
    </>
  );
}

export function Section({ id, color, title, children }: { id: string; color: string; icon?: string; title: string; children: React.ReactNode }) {
  return (
    <SectionColor.Provider value={color}>
      <section className="group" id={id} aria-label={title}>
        <h3 className="group-title">{title}</h3>
        <div className="list">{children}</div>
      </section>
    </SectionColor.Provider>
  );
}

const JUMPS: Array<[string, string]> = [["events", "Events"], ["google-tag", "Google tag"], ["data-collection", "Data collection"], ["signals", "Signals"]];

function ToggleChips({ items, label }: { items: Toggle[]; label: string }) {
  const on = items.filter((item) => item.on);
  if (!on.length) return <span>Nothing enabled</span>;
  return (
    <>
      <span>{label}:</span>
      {on.slice(0, 3).map((item) => <span className="chip" key={item.key}><Icon name={item.icon} /> {item.label}</span>)}
      {on.length > 3 && <span className="more">+{on.length - 3} more</span>}
    </>
  );
}

function ToggleList({ items }: { items: Toggle[] }) {
  return (
    <>
      <div className="sublabel">Auto-tracked interactions</div>
      <div className="list-rows">
        {items.map((item) => (
          <div className="list-row" key={item.key}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.note && <span className="badge">{item.note}</span>}
            <span className={`right pill-onoff ${item.on ? "pill-on" : "pill-off"}`}>{item.on ? "ON" : "OFF"}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function RuleCard({ rule, kind }: { rule: EventRule; kind: "create" | "modify" }) {
  const [open, setOpen] = useState(false);
  const conditions = rule.conditions.length;
  return (
    <div className="event-card">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="plus"><Icon name={kind === "create" ? "add" : "edit"} className="sm" /></span>
        <span className="title">
          {kind === "modify" && <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>#{rule.order} · </span>}
          {kind === "modify" && rule.sourceEvent && <><code style={{ color: "var(--text)" }}>{rule.sourceEvent}</code> <Icon name="arrow_forward" className="xs" /> </>}
          <code>{rule.name || rule.sourceEvent || "(unchanged name)"}</code>
          {rule.copyParams && <span className="chip" style={{ marginLeft: 8, fontSize: 11 }}><Icon name="content_copy" className="xs" /> copy params</span>}
          <small>{conditions} condition{conditions === 1 ? "" : "s"} · {rule.operations.length} operation{rule.operations.length === 1 ? "" : "s"}</small>
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} />
      </button>
      {open && (
        <div className="event-body">
          <div className="sublabel">Source conditions</div>
          {rule.conditions.length ? rule.conditions.map((condition, index) => (
            <div className="cond" key={index}>
              <span className="param">{condition.parameter}</span>
              {condition.negate && <span className="not">NOT</span>}
              <span className="op" title={`Compiled operator: ${condition.code}`}>{condition.operator}{condition.ignoreCase ? " (ignore case)" : ""}</span>
              <span className="val">{condition.value}</span>
            </div>
          )) : <p className="muted">No conditions.</p>}
          {rule.operations.length > 0 && (
            <>
              <div className="sublabel">Parameter operations</div>
              {rule.operations.map((operation, index) => (
                <div className="cond" key={index}>
                  <span className="op"><Icon name={operation.action === "REMOVE" ? "delete" : operation.action === "COPY" ? "content_copy" : "edit"} className="xs" /> {operation.action}</span>
                  <span className="mono">{operation.parameter}</span>
                  {operation.action !== "REMOVE" && <><span className="muted">{operation.action === "COPY" ? "from" : "="}</span><span className="mono" style={{ color: "var(--primary)" }}>{operation.value}</span></>}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const yesNo = (value: boolean) => (value ? "Yes" : "No");

export function Ga4Report({ report, onWatch, onShare, onRefresh, refreshing }: { report: Report; onWatch: () => void; onShare: () => void; onRefresh: () => void; refreshing: boolean }) {
  const r = report;
  const count = (value: unknown[] | null | undefined) => value?.length ?? 0;
  const session = r.session;
  const dtc = r.dataTransmission;
  return (
    <div className="report">
      <header className="summary">
        <div className="summary-id">
          <ProductGlyph kind="ga4" size="large" />
          <div>
            <p className="eyebrow">Google Analytics 4 property</p>
            <h2 className="mono">{r.measurementId}</h2>
            <p className="muted">Library v{r.libraryVersion ?? "?"} · Read {formatDateTime(r.fetchedAt)}{r.requestedId !== r.measurementId ? ` · via ${r.requestedId}` : ""}</p>
          </div>
        </div>
        <div className="summary-actions">
          <button type="button" className="btn btn-primary" onClick={onWatch}><Icon name="notifications" fill className="sm" /> Follow</button>
          <button type="button" className="btn" onClick={onRefresh} disabled={refreshing} aria-label="Refresh">{refreshing ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" className="sm" />}</button>
          <button type="button" className="btn" onClick={onShare} aria-label="Share"><Icon name="ios_share" className="sm" /></button>
        </div>
      </header>
      <div className="tiles">
        <div className="tile"><span>Key events</span><strong>{r.keyEvents.length}</strong></div>
        <div className="tile"><span>Created events</span><strong>{r.createdEvents.length}</strong></div>
        <div className="tile"><span>Modified events</span><strong>{r.modifiedEvents.length}</strong></div>
        <div className="tile"><span>Cross-domain</span><strong>{count(r.crossDomains)}</strong></div>
        <div className="tile"><span>Unwanted referrals</span><strong>{count(r.unwantedReferrals)}</strong></div>
        <div className="tile"><span>Library</span><strong>v{r.libraryVersion ?? "?"}</strong></div>
      </div>
      <nav className="jumpbar" aria-label="Sections">
        {JUMPS.filter(([id]) => id !== "signals" || r.tagSignals.length).map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      {r.otherDestinations.length > 0 && (
        <div className="note"><Icon name="info" className="sm" /> This Google tag also sends data to {r.otherDestinations.join(", ")}. Open one to see its settings.</div>
      )}

      <Section id="events" color="orange" title="Events">
        <Row icon="auto_awesome" title="Enhanced measurement" description="Automatically measure interactions and content on your sites."
          toggle={!!r.enhancedMeasurement} chips={r.enhancedMeasurement ? <ToggleChips items={r.enhancedMeasurement.items} label="Measuring" /> : undefined}>
          {r.enhancedMeasurement && <>
            <ToggleList items={r.enhancedMeasurement.items} />
            {r.enhancedMeasurement.siteSearch && (
              <div className="kv-grid" style={{ marginTop: 12 }}>
                <div className="kv"><span>Search term query parameters</span><strong className="mono">{r.enhancedMeasurement.siteSearch.queryParams.join(", ") || "—"}</strong></div>
                <div className="kv"><span>Additional query parameters</span><strong className="mono">{r.enhancedMeasurement.siteSearch.additionalParams.join(", ") || "—"}</strong></div>
              </div>
            )}
          </>}
        </Row>
        <Row icon="ads_click" title="Create custom events" description="Create new events from existing events."
          side={<span className="badge badge-primary">{r.createdEvents.length ? `${r.createdEvents.length} events` : "No rules"}</span>}>
          {r.createdEvents.length ? r.createdEvents.map((rule) => <RuleCard key={`${rule.order}-${rule.name}`} rule={rule} kind="create" />) : undefined}
        </Row>
        <Row icon="touch_app" title="Modify events" description="Modify incoming events and their parameters."
          side={<span className="badge badge-primary">{r.modifiedEvents.length ? `${r.modifiedEvents.length} rules` : "No rules"}</span>}>
          {r.modifiedEvents.length ? r.modifiedEvents.map((rule) => <RuleCard key={`${rule.order}-${rule.name}`} rule={rule} kind="modify" />) : undefined}
        </Row>
        <Row icon="flag" title="Key events" description="Events marked as conversions / key events."
          side={<span className="badge badge-primary">{r.keyEvents.length ? `${r.keyEvents.length} events` : "None"}</span>}>
          {r.keyEvents.length ? <div className="list-rows">{r.keyEvents.map((name) => <div className="list-row" key={name}><Icon name="flag" fill className="sm" /><code>{name}</code></div>)}</div> : undefined}
        </Row>
        <Row icon="ink_eraser" title="Redact data" description="Prevent specific data from being sent to Google Analytics."
          chips={r.redaction ? <>
            <span className={`chip ${r.redaction.email ? "" : "chip-muted"}`}>Email {r.redaction.email ? "active" : "inactive"}</span>
            <span className={`chip ${r.redaction.queryParams.length ? "" : "chip-muted"}`}>URL params {r.redaction.queryParams.length ? "active" : "inactive"}</span>
          </> : undefined}
          side={!r.redaction ? <span className="badge">Not set</span> : undefined}>
          {r.redaction ? (
            <div className="inner-box">
              <div className="line"><span>Email redaction</span><Switch on={r.redaction.email} small /></div>
              <div className="line"><span>URL query parameter keys</span><code style={{ color: "var(--text)" }}>{r.redaction.queryParams.join(",") || "—"}</code></div>
            </div>
          ) : undefined}
        </Row>
      </Section>

      <Section id="google-tag" color="blue" title="Google tag">
        <Row icon="auto_awesome" title="Manage automatic event detection" description="Configure which types of events should automatically be detected for measurement in associated Google destinations."
          toggle={r.autoEventDetection ? r.autoEventDetection.items.some((item) => item.on) : null}
          chips={r.autoEventDetection ? <ToggleChips items={r.autoEventDetection.items} label="Detecting" /> : undefined}>
          {r.autoEventDetection ? <ToggleList items={r.autoEventDetection.items} /> : undefined}
        </Row>
        <Row icon="link" title="Configure your domains" description="Specify a list of domains for cross-domain measurement."
          side={<span className="badge">{count(r.crossDomains)} domains</span>}>
          {count(r.crossDomains) ? <div className="list-rows">{r.crossDomains!.map((domain, index) => <div className="list-row" key={index}><Icon name="link" className="sm" /><code>{domain}</code></div>)}</div> : undefined}
        </Row>
        <Row icon="lan" title="Define internal traffic" description="Define IP addresses whose traffic should be marked as internal."
          side={<span className="badge">{r.internalTrafficRules.length} rules</span>}>
          <>
            {r.internalTrafficRules.length ? <div className="list-rows">{r.internalTrafficRules.map((rule) => <div className="list-row" key={rule.order}><Icon name="lan" className="sm" />Rule #{rule.order + 1}<span className="right muted">traffic_type = <code>{rule.paramValue}</code></span></div>)}</div> : <p className="muted" style={{ margin: 0 }}>No internal traffic rules configured.</p>}
            {r.internalTrafficRules.length > 0 && <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>The IP ranges themselves are evaluated by Google and never published.</p>}
          </>
        </Row>
        <Row icon="link_off" title="List unwanted referrals" description="Specify domains whose traffic should not be considered to be referrals."
          side={<span className="badge">{count(r.unwantedReferrals)}</span>}>
          {count(r.unwantedReferrals) ? <div className="list-rows">{r.unwantedReferrals!.map((domain, index) => <div className="list-row" key={index}><Icon name="link_off" className="sm" /><code>{domain}</code></div>)}</div> : undefined}
        </Row>
        <Row icon="timer" title="Adjust session timeout" description="Set how long sessions can last.">
          {session ? (
            <div className="kv-grid">
              <div className="kv"><span>Hours</span><strong>{session.hours}</strong></div>
              <div className="kv"><span>Minutes</span><strong>{session.minutes}</strong></div>
              {session.engagementSeconds != null && <div className="kv"><span>Engaged session timer</span><strong>{session.engagementSeconds}s</strong></div>}
            </div>
          ) : <p className="muted" style={{ margin: 0 }}>Google defaults (30 minutes, 10s engaged session).</p>}
        </Row>
        <Row icon="cookie" title="Override cookie settings" description="Change how long cookies last and how they are updated.">
          {r.cookies.length ? <div className="kv-grid">{r.cookies.map((cookie) => <div className="kv" key={cookie.key}><span>{cookie.label}</span><strong className="mono">{cookie.value}</strong></div>)}</div> : <p className="muted" style={{ margin: 0 }}>Default cookie settings — no overrides detected.</p>}
        </Row>
        <Row icon="call_split" title="Collect Universal Analytics events" description="Collect an event each time a ga() custom event, timing, or exception call occurs." toggle={r.uaEvents ?? false} />
        <Row icon="contact_page" title="Allow user-provided data capabilities" description="Configure whether to allow user-provided data in measurement."
          toggle={r.userProvidedData ? r.userProvidedData.find((item) => item.key === "isEnabled")?.on ?? false : false}>
          {r.userProvidedData ? <div className="kv-grid">{r.userProvidedData.map((item) => <div className="kv" key={item.key}><span>{item.label}</span><strong>{yesNo(item.on)}</strong></div>)}</div> : undefined}
        </Row>
        <Row icon="hub" title="Manage data use across Google services" description="Choose which Google services can receive consented data."
          side={r.dataUse ? <span className="badge">{r.dataUse.mode}</span> : <span className="badge badge-italic">Defaults</span>}>
          {r.dataUse ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>{r.dataUse.mode === "ALL" ? "All Google services (recommended) — all services receive consented data." : "Only the selected Google services receive consented data."}</p>
              <div className="list-rows">{r.dataUse.services.map((service) => <div className="list-row" key={service.key}><Icon name={service.icon} className="sm" />{service.label}<span className={`right pill-onoff ${service.on ? "pill-on" : "pill-off"}`}>{service.on ? "ON" : "OFF"}</span></div>)}</div>
            </>
          ) : undefined}
        </Row>
        <Row icon="data_object" title="Extract data from your page" description="Pull values from JS variables, CSS selectors or the data layer into event parameters."
          side={<span className="badge badge-primary">{r.dataExtraction.length ? `${r.dataExtraction.length} rule${r.dataExtraction.length === 1 ? "" : "s"}` : "No rules"}</span>}>
          {r.dataExtraction.length ? (
            <div className="table-wrap"><table className="table"><thead><tr><th>Event parameter</th><th>Extraction mode</th><th>Extraction location</th></tr></thead>
              <tbody>{r.dataExtraction.map((rule, index) => <tr key={index}><td><code>{rule.parameter}</code></td><td>{rule.mode}</td><td><code>{rule.location}</code></td></tr>)}</tbody></table></div>
          ) : undefined}
        </Row>
        <Row icon="code" title="Connected site tags" description="Load tags for additional properties using this stream's Google tag."
          side={<span className="badge badge-primary">{r.connectedTags.length ? `${r.connectedTags.length} connected` : "None"}</span>}>
          {r.connectedTags.length ? <div className="list-rows">{r.connectedTags.map((tag) => <div className="list-row" key={tag.id}><Icon name="code" className="sm" /><code>{tag.id}</code><span className="right muted">{tag.product}</span></div>)}</div> : undefined}
        </Row>
        <Row icon="settings_input_antenna" title="Manage data transmission" description="Configure how much advertising and analytics data Google receives before consent signals arrive."
          side={dtc ? <span className="badge">{dtc.restrictAds || dtc.preventAds || dtc.preventAnalytics ? "Restricted" : "Standard"}</span> : <span className="badge badge-italic">Defaults</span>}>
          {dtc ? (
            <>
              <div className="check"><span className={`box ${dtc.restrictAds ? "on" : ""}`}>{dtc.restrictAds && <Icon name="check" className="xs" />}</span> Restrict advertising data transmission</div>
              <div className="radio-list" style={{ margin: "8px 0 14px 28px" }}>
                <div className={`radio ${!dtc.preventAds ? "sel" : ""}`}><span className="dot" /><div><strong>Transmit limited advertising data only</strong><p>Conversion modeling is supported based on generalized trends that may not be specific to your account.</p></div></div>
                <div className={`radio ${dtc.preventAds ? "sel" : ""}`}><span className="dot" /><div><strong>Prevent transmission of advertising data</strong><p>No advertising data is transmitted until user consent is granted.</p></div></div>
              </div>
              <div className="sublabel">Additional settings</div>
              <div className="check"><span className={`box ${dtc.preventAnalytics ? "on" : ""}`}>{dtc.preventAnalytics && <Icon name="check" className="xs" />}</span> Prevent transmission of behavioral analytics data</div>
              <div className="check"><span className={`box ${dtc.preventDiagnostics ? "on" : ""}`}>{dtc.preventDiagnostics && <Icon name="check" className="xs" />}</span> Prevent transmission of diagnostics data</div>
              <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>Compiled level: <code>{dtc.level}</code></p>
            </>
          ) : undefined}
        </Row>
        <Row icon="gpp_maybe" title="Override consent mode defaults" description={`Load the Google tag with consent set to "denied" for ads or analytics until a consent signal arrives.`}>
          {r.consentOverrides ? (
            <div className="kv-grid">
              <div className="kv"><span>Ads settings</span><strong><span className={`pill-onoff ${r.consentOverrides.ads.denied ? "pill-on" : "pill-off"}`}>{r.consentOverrides.ads.denied ? "ON" : "OFF"}</span></strong><span>Regions: {r.consentOverrides.ads.regions}</span></div>
              <div className="kv"><span>Analytics settings</span><strong><span className={`pill-onoff ${r.consentOverrides.analytics.denied ? "pill-on" : "pill-off"}`}>{r.consentOverrides.analytics.denied ? "ON" : "OFF"}</span></strong><span>Regions: {r.consentOverrides.analytics.regions}</span></div>
            </div>
          ) : <p className="muted" style={{ margin: 0 }}>No consent default overrides in the published tag.</p>}
        </Row>
        <Row icon="verified_user" title="Manage default consent settings for data collection" description="Default labels for end-user data from the EEA used for advertising purposes."
          side={r.dmaDefaults ? <span className="badge">{r.dmaDefaults.value}</span> : <span className="badge badge-italic">Defaults</span>}>
          {r.dmaDefaults ? (
            <>
              <div className="radio-list">
                <div className={`radio ${r.dmaDefaults.value !== "GRANTED" ? "sel" : ""}`}><span className="dot" /><div><strong>No. Do not automatically mark this data as consented.</strong><p>Google will not use personal data if consent has not been granted by end users.</p></div></div>
                <div className={`radio ${r.dmaDefaults.value === "GRANTED" ? "sel" : ""}`}><span className="dot" /><div><strong>Yes. Automatically mark this data as consented.</strong><p>For businesses that block the Google tag until the user grants consent.</p></div></div>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Delegation mode: <span className="badge">{r.dmaDefaults.delegationMode}</span></p>
            </>
          ) : undefined}
        </Row>
      </Section>

      <Section id="data-collection" color="green" title="Data collection">
        <Row icon="sensors" title="Google Signals" description={`Advertising features signal: ${r.googleSignals ?? "not published"}`} toggle={r.googleSignals === "ENABLED"} />
        <Row icon="pin_drop" title="Granular location and device data collection"
          description={r.granularLocation ? (r.granularLocation.disallowAll ? "Disabled in all regions" : r.granularLocation.allowedEverywhere ? "Allowed in all regions" : `Allowed everywhere except: ${r.granularLocation.regions.length} regions`) : "Not published"}
          side={r.granularLocation && !r.granularLocation.allowedEverywhere ? <span className="badge">Restricted</span> : undefined}>
          {r.granularLocation && r.granularLocation.regions.length ? <p className="mono" style={{ margin: 0, fontSize: 12.5, overflowWrap: "anywhere" }}>{r.granularLocation.regions.join(", ")}</p> : undefined}
        </Row>
        <Row icon="contact_mail" title="User-provided data collection" description="Sends hashed, consented user-provided data to Analytics for improved measurement and audiences."
          toggle={r.userDataCollection ? r.userDataCollection.autoDetected || r.userDataCollection.stitching : false} defaultOpen={!!r.userDataCollection}>
          {r.userDataCollection ? (
            <div className="inner-box">
              <div className="line"><span>Collect automatically-detected user-provided data</span><Switch on={r.userDataCollection.autoDetected} small /></div>
              <div className="line"><span>Enhanced Conversions stitching</span><Switch on={r.userDataCollection.stitching} small /></div>
              <p className="faint" style={{ fontSize: 12.5, margin: "6px 0 0" }}>When on, the Google tag automatically detects and hashes user-provided data (email, phone, address) on your site.</p>
            </div>
          ) : undefined}
        </Row>
      </Section>

      {r.tagSignals.length > 0 && <>
        <Section id="signals" color="purple" title="Tag signals">
          {r.tagSignals.map((signalItem) => <Row key={signalItem.key} icon={signalItem.icon} title={signalItem.label} description={signalItem.description} toggle />)}
        </Section>
      </>}

      {r.unrecognized.length > 0 && (
        <div className="note"><Icon name="help" className="sm" /> The tag also contains compiled rules this version doesn&apos;t visualize yet: <code>{r.unrecognized.join(", ")}</code></div>
      )}
    </div>
  );
}
