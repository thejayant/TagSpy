"use client";

import { useState } from "react";
import type { CodelessRule, MetaFeature, MetaPixelReport as Report } from "@/lib/meta/types";
import { Icon, ProductGlyph, formatDateTime } from "./chrome";
import { Row, Section } from "./ga4-report";
import { CodeView } from "./gtm-drawer";
import { Sheet } from "./sheet";

const EVENT_ICON: Record<string, string> = {
  Purchase: "shopping_bag", Lead: "person_add", CompleteRegistration: "how_to_reg", AddToCart: "add_shopping_cart",
  InitiateCheckout: "shopping_cart_checkout", ViewContent: "visibility", Search: "search", Contact: "call",
  Subscribe: "notifications_active", Schedule: "event", SubmitApplication: "assignment_turned_in", AddPaymentInfo: "credit_card",
  AddToWishlist: "favorite", StartTrial: "rocket_launch", FindLocation: "location_on", CustomizeProduct: "tune",
  Donate: "volunteer_activism", PageView: "web",
};
const MATCH_ICON: Record<string, string> = {
  em: "mail", ph: "call", fn: "badge", ln: "badge", ge: "wc", db: "cake", ct: "location_city", st: "map",
  zp: "markunread_mailbox", country: "public", external_id: "fingerprint",
};
const CATEGORY_ICON: Record<MetaFeature["category"], [string, string]> = {
  Events: ["bolt", "orange"], Matching: ["fingerprint", "purple"], Privacy: ["shield", "green"],
  Measurement: ["query_stats", "blue"], Integration: ["dns", "indigo"], Other: ["tune", "gray"],
};
const JUMPS: Array<[string, string]> = [["events", "Events"], ["matching", "Matching"], ["privacy", "Privacy"], ["server", "Server & identity"], ["features", "Features"], ["advanced", "Advanced"]];

/** The setup score as a ring: one glance for how much signal the pixel can send Meta. */
function ScoreRing({ value }: { value: number }) {
  const radius = 52;
  const length = 2 * Math.PI * radius;
  const tone = value >= 75 ? "good" : value >= 50 ? "fair" : "weak";
  return (
    <div className={`score-ring ${tone}`} role="img" aria-label={`Setup score ${value} out of 100`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="score-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ring-a)" />
            <stop offset="100%" stopColor="var(--ring-b)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={radius} className="track" />
        <circle cx="60" cy="60" r={radius} className="fill" stroke="url(#score-gradient)" strokeDasharray={`${(value / 100) * length} ${length}`} />
      </svg>
      <div><strong>{value}</strong><span>/ 100</span></div>
    </div>
  );
}

type Check = { label: string; passed: boolean; points: number; hint: string };

/** A 0–100 score with its ring, a one-line verdict, the biggest missing gain and a sheet with every check. */
export function ScorePanel({ value, checks, eyebrow, headlines, note }: { value: number; checks: Check[]; eyebrow: string; headlines: [string, string, string]; note: string }) {
  const [open, setOpen] = useState(false);
  const passed = checks.filter((check) => check.passed).length;
  const missing = checks.filter((check) => !check.passed).sort((a, b) => b.points - a.points);
  return (
    <section className="score-card" aria-label={eyebrow}>
      <ScoreRing value={value} />
      <div className="score-body">
        <p className="eyebrow">{eyebrow}</p>
        <h3>{value >= 75 ? headlines[0] : value >= 50 ? headlines[1] : headlines[2]}</h3>
        <p className="muted">{passed} of {checks.length} checks pass. {note}</p>
        {missing.length > 0 && <p className="score-next"><Icon name="trending_up" className="sm" /> Biggest gain: <strong>{missing[0].label}</strong> (+{missing[0].points})</p>}
        <button type="button" className="btn btn-tinted" onClick={() => setOpen(true)}>See all checks</button>
      </div>
      {open && (
        <Sheet title={eyebrow} subtitle={`${value} / 100 · ${passed} of ${checks.length} checks pass`} onClose={() => setOpen(false)}>
          <div className="list-rows">
            {checks.map((check) => (
              <div className="list-row score-check" key={check.label}>
                <Icon name={check.passed ? "check_circle" : "radio_button_unchecked"} fill={check.passed} className={check.passed ? "ok" : "miss"} />
                <span><strong>{check.label}</strong>{!check.passed && <small>{check.hint}</small>}</span>
                <span className="right mono">{check.passed ? `+${check.points}` : `0 / ${check.points}`}</span>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </section>
  );
}

function ScoreCard({ report }: { report: Report }) {
  return (
    <ScorePanel value={report.score.value} checks={report.score.checks} eyebrow="Signal setup score"
      headlines={["Strong signal setup", "Room to send Meta more signal", "Weak signal setup"]}
      note="Estimated from the public pixel configuration only; events sent in the site's own code or through a direct Conversions API integration are not visible here." />
  );
}

/** A codeless rule written as a sentence, with each part of the condition highlighted. */
function RuleSentence({ rule }: { rule: CodelessRule }) {
  if (!rule.conditions.length) return <span>Always</span>;
  const join = rule.match === "any" ? "or" : "and";
  return (
    <span className="rule-sentence">
      {rule.match === "none" ? "Unless a visitor " : "When a visitor "}
      {rule.conditions.map((condition, index) => (
        <span key={index}>
          {index > 0 && <em className="rule-join"> {join} </em>}
          <b className="tok-trigger">{condition.trigger}</b> {condition.target} whose <b className="tok-field">{condition.field}</b> <span className="tok-op">{condition.operator}</span> <code className="tok-value">{condition.value || "(empty)"}</code>
        </span>
      ))}
    </span>
  );
}

function CodelessEvents({ rules }: { rules: CodelessRule[] }) {
  const byEvent = new Map<string, CodelessRule[]>();
  for (const rule of rules) byEvent.set(rule.event, [...(byEvent.get(rule.event) ?? []), rule]);
  return (
    <div className="rule-groups">
      {[...byEvent].map(([event, items]) => (
        <div className="rule-group" key={event}>
          <header>
            <span className="glyph g-orange"><Icon name={EVENT_ICON[event] ?? "bolt"} fill /></span>
            <strong>{event}</strong>
            <span className="muted small">{items.length} rule{items.length === 1 ? "" : "s"}</span>
          </header>
          <ul>
            {items.map((rule) => (
              <li key={rule.id} className={rule.active ? "" : "inactive"}>
                <RuleSentence rule={rule} />
                <span className="rule-meta"><Icon name="arrow_forward" className="xs" /> {event}{!rule.active && " · inactive"} · <span className="mono">#{rule.id}</span></span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function MetaReport({ report, onWatch, onShare, onRefresh, refreshing }: { report: Report; onWatch: () => void; onShare: () => void; onRefresh: () => void; refreshing: boolean }) {
  const r = report;
  const activeRules = r.codelessEvents.filter((rule) => rule.active);
  const blockedCount = r.restrictions.blockedParams.reduce((sum, item) => sum + item.urlParams.length + item.customData.length, 0);
  const flagsOn = r.rolloutFlags.filter((flag) => flag.on).length;
  const categories = [...new Set(r.features.map((feature) => feature.category))];
  const rawJson = JSON.stringify(r.raw, null, 2);

  return (
    <div className="report">
      <header className="summary">
        <div className="summary-id">
          <ProductGlyph kind="meta" size="large" />
          <div>
            <p className="eyebrow">Meta Pixel</p>
            <h2 className="mono">{r.pixelId}</h2>
            <p className="muted">{r.features.length} features loaded · Read {formatDateTime(r.fetchedAt)}</p>
          </div>
        </div>
        <div className="summary-actions">
          <button type="button" className="btn btn-primary" onClick={onWatch}><Icon name="notifications" fill className="sm" /> Follow</button>
          <button type="button" className="btn" onClick={onRefresh} disabled={refreshing} aria-label="Refresh">{refreshing ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" className="sm" />}</button>
          <button type="button" className="btn" onClick={onShare} aria-label="Share"><Icon name="ios_share" className="sm" /></button>
        </div>
      </header>

      <ScoreCard report={r} />

      <div className="tiles">
        <div className="tile"><span>Codeless events</span><strong>{activeRules.length}</strong></div>
        <div className="tile"><span>Matching fields</span><strong>{r.automaticMatching.enabled ? r.automaticMatching.keys.length : 0}</strong></div>
        <div className="tile"><span>Server-side</span><strong>{r.conversionsApiGateway ? "On" : "Off"}</strong></div>
        <div className="tile"><span>Blocked params</span><strong>{blockedCount}</strong></div>
        <div className="tile"><span>Features</span><strong>{r.features.length}</strong></div>
        <div className="tile"><span>Rollout flags</span><strong>{flagsOn}<small>/{r.rolloutFlags.length}</small></strong></div>
      </div>
      <nav className="jumpbar" aria-label="Sections">
        {JUMPS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <Section id="events" color="orange" title="Events">
        <Row icon="ads_click" title="Codeless events" description="Event Setup Tool rules that turn clicks and page loads into standard events, without code."
          side={<span className="badge badge-primary">{activeRules.length ? `${activeRules.length} rules` : "None"}</span>}>
          {r.codelessEvents.length ? <CodelessEvents rules={r.codelessEvents} /> : <p className="muted">This pixel publishes no Event Setup Tool rules. Events the site sends from its own code (fbq(&apos;track&apos;, …)) or through GTM are not part of the pixel configuration.</p>}
        </Row>
        <Row icon="auto_awesome" title="Automatic events" description="Button clicks and page metadata sent automatically (SubscribedButtonClick, Microdata)." toggle={r.inferredEvents.enabled}>
          <div className="kv-grid">
            <div className="kv"><span>Status</span><strong>{r.inferredEvents.enabled ? "On" : "Off"}</strong></div>
            <div className="kv"><span>Restricted data</span><strong>{r.inferredEvents.restrictedDataDisabled ? "Not collected" : "Allowed"}</strong></div>
            <div className="kv"><span>Button selector</span><strong className="mono">{r.inferredEvents.buttonSelector ?? "Default"}</strong></div>
          </div>
        </Row>
        <Row icon="data_object" title="Codeless parameters" description="Custom parameters read from page elements, chosen in the Event Setup Tool."
          side={<span className="badge badge-primary">{r.parameterExtractors.length || "None"}</span>}>
          {r.parameterExtractors.length ? <CodeView code={JSON.stringify(r.parameterExtractors, null, 2)} filename={`${r.pixelId}-parameters.json`} label="JSON" /> : <p className="muted">No parameter extraction rules are published.</p>}
        </Row>
      </Section>

      <Section id="matching" color="purple" title="Advanced matching">
        <Row icon="fingerprint" title="Automatic advanced matching" description="Customer details read from forms, hashed (SHA-256) in the browser and sent with events."
          toggle={r.automaticMatching.enabled}
          chips={r.automaticMatching.enabled && r.automaticMatching.keys.length ? <>
            <span>Fields:</span>
            {r.automaticMatching.keys.slice(0, 4).map((key) => <span className="chip" key={key.key}><Icon name={MATCH_ICON[key.key] ?? "person"} /> {key.label}</span>)}
            {r.automaticMatching.keys.length > 4 && <span className="more">+{r.automaticMatching.keys.length - 4} more</span>}
          </> : undefined}>
          {r.automaticMatching.enabled ? (
            <>
              <div className="sublabel">Fields Meta reads and hashes</div>
              <div className="match-grid">
                {r.automaticMatching.keys.map((key) => (
                  <div className="match-key" key={key.key}><Icon name={MATCH_ICON[key.key] ?? "person"} fill /><strong>{key.label}</strong><code>{key.key}</code></div>
                ))}
              </div>
              <p className="muted small">Values never leave the browser in plain text: the pixel normalizes and hashes them before sending.</p>
            </>
          ) : <p className="muted">Automatic advanced matching is off. The site may still pass customer data manually with fbq(&apos;init&apos;, id, {"{ em: … }"}), which is not visible in the configuration.</p>}
        </Row>
        <Row icon="storefront" title="Partner advanced matching" description="Advanced matching for partner platforms such as Shopify or WooCommerce." toggle={r.automaticMatching.partnerIntegrations} />
      </Section>

      <Section id="privacy" color="green" title="Privacy and restrictions">
        <Row icon="block" title="Blocked parameters" description="URL parameters and custom data Meta strips before events leave the browser."
          side={<span className="badge badge-primary">{blockedCount || "None"}</span>}>
          {r.restrictions.blockedParams.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Event</th><th>URL parameters</th><th>Custom data</th></tr></thead>
                <tbody>{r.restrictions.blockedParams.map((item) => (
                  <tr key={item.event}><td><strong>{item.event}</strong></td><td className="mono">{item.urlParams.join(", ") || "—"}</td><td className="mono">{item.customData.join(", ") || "—"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="muted">Nothing is blocked for this pixel.</p>}
        </Row>
        <Row icon="report" title="Restricted events" description="Events Meta limits for this pixel, for example for sensitive categories."
          side={<span className="badge badge-primary">{r.restrictions.restrictedEvents.length || "None"}</span>}
          chips={r.restrictions.restrictedEvents.length ? r.restrictions.restrictedEvents.slice(0, 4).map((name) => <span className="chip chip-warn" key={name}>{name}</span>) : undefined} />
        <Row icon="help" title="Unverified events" description="Events that need domain verification or Aggregated Event Measurement setup."
          side={<span className="badge badge-primary">{r.restrictions.unverifiedEvents.length || "None"}</span>}
          chips={r.restrictions.unverifiedEvents.length ? r.restrictions.unverifiedEvents.slice(0, 4).map((name) => <span className="chip chip-warn" key={name}>{name}</span>) : undefined} />
        <Row icon="do_not_disturb_on" title="Prohibited sources" description="Traffic sources whose events Meta drops for this pixel."
          side={<span className="badge badge-primary">{r.restrictions.prohibitedSources.length || "None"}</span>} />
        <Row icon="visibility_off" title="Sensitive keys" description="Keys Meta treats as sensitive and removes automatically."
          side={<span className="badge badge-primary">{r.restrictions.sensitiveKeys.length || "None"}</span>}
          chips={r.restrictions.sensitiveKeys.length ? r.restrictions.sensitiveKeys.map((key) => <span className="chip" key={key}>{key}</span>) : undefined} />
      </Section>

      <Section id="server" color="indigo" title="Server-side and identity">
        <Row icon="dns" title="Conversions API Gateway" description="Events are also sent server-side through the site's gateway, so ad blockers and browser limits lose fewer of them." toggle={r.conversionsApiGateway} />
        <Row icon="cookie" title="First-party cookies" description="The _fbp browser ID and _fbc click ID live in cookies on the site's own domain." toggle={r.identity.firstPartyCookies} />
        <Row icon="link" title="Click IDs captured" description="Landing-page URL parameters the pixel turns into click IDs for attribution."
          side={<span className="badge badge-primary">{r.identity.clickIdParams.length}</span>}
          chips={r.identity.clickIdParams.map((item) => <span className="chip" key={item.param}><Icon name="link" /> {item.param}</span>)}>
          <div className="list-rows">
            {r.identity.clickIdParams.map((item) => (
              <div className="list-row" key={item.param}><Icon name="link" /><code>{item.param}</code><span className="right muted small">{item.purpose}</span></div>
            ))}
          </div>
        </Row>
        <Row icon="phone_iphone" title="iOS measurement bridge" description="Aggregated Event Measurement and Private Click Measurement for iOS in-app browser traffic." toggle={r.aemBridge} />
        <Row icon="travel_explore" title="Last external referrer" description="Keeps the traffic source of the visit on later events." toggle={r.identity.lastExternalReferrer} />
      </Section>

      <Section id="features" color="blue" title="Pixel features">
        {categories.map((category) => {
          const items = r.features.filter((feature) => feature.category === category);
          const [icon, color] = CATEGORY_ICON[category];
          return (
            <Row key={category} icon={icon} title={category} description={items.map((feature) => feature.name).join(", ")} side={<span className="badge badge-primary">{items.length}</span>}>
              <div className="feature-list">
                {items.map((feature) => (
                  <div className="feature" key={feature.key}>
                    <span className={`glyph xs g-${color}`}><Icon name={icon} fill /></span>
                    <div><strong>{feature.name}</strong><p>{feature.description}</p><code>{feature.key}</code></div>
                  </div>
                ))}
              </div>
            </Row>
          );
        })}
      </Section>

      <Section id="advanced" color="gray" title="Advanced">
        <Row icon="flag" title="Meta rollout flags" description="Server-side feature flags Meta has switched on or off for this pixel."
          side={<span className="badge badge-primary">{flagsOn} on</span>}
          chips={<>{r.rolloutFlags.filter((flag) => flag.on).slice(0, 3).map((flag) => <span className="chip chip-ok" key={flag.name}>{flag.label}</span>)}{flagsOn > 3 && <span className="more">+{flagsOn - 3} more</span>}</>}>
          <div className="flag-grid">
            {r.rolloutFlags.map((flag) => (
              <div className={`flag ${flag.on ? "on" : ""}`} key={flag.name}>
                <span className={`status-dot ${flag.on ? "live" : "off"}`} />
                <div><strong>{flag.label}</strong><code>{flag.name}</code></div>
              </div>
            ))}
          </div>
        </Row>
        <Row icon="code" title="Raw configuration" description={`Every settings block Meta publishes for this pixel (${Object.keys(r.raw).length} blocks).`}>
          <CodeView code={rawJson} filename={`meta-pixel-${r.pixelId}.json`} label="JSON" />
        </Row>
        <div className="cell">
          <span className="glyph g-gray"><Icon name="open_in_new" fill /></span>
          <span className="cell-text"><strong>Source</strong><small><a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">{r.sourceUrl.replace(/^https:\/\//, "")}</a></small></span>
          <span className="cell-side"><span className="pill pill-on">Public</span></span>
        </div>
      </Section>
    </div>
  );
}
