"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GtmContainer, GtmTag, GtmTrigger, GtmVariable, Param, ParamValue } from "@/lib/gtm/types";
import { brandByName, brandForTag } from "@/lib/brands";
import { tagHeadline } from "@/lib/gtm/present";
import { BrandGlyph, Icon } from "./chrome";
import { useToast } from "./toast";

export type DrawerItem = { kind: "tag" | "trigger" | "variable"; id: string };

const TAG_ICON: Record<string, [string, string]> = {
  ga: ["bar_chart", "g-orange"], google: ["sell", "g-blue"], ads: ["campaign", "g-yellow"], code: ["code", "g-gray"], image: ["image", "g-pink"], extension: ["extension", "g-purple"], sell: ["sell", "g-gray"],
};
const TRIGGER_COLOR: Record<string, string> = {
  visibility: "g-blue", web_asset: "g-blue", code: "g-orange", link: "g-teal", mouse: "g-indigo", history: "g-purple", assignment: "g-green",
};

const YOUTUBE = brandByName("YouTube");

/** The vendor's logo when the tag's vendor, group or type is recognized; otherwise a generic glyph. */
export function TagIcon({ tag, size }: { tag: Pick<GtmTag, "icon"> & Partial<Pick<GtmTag, "vendor" | "group" | "type">>; size?: "xs" | "md" | "large" }) {
  const brand = brandForTag(tag);
  if (brand) return <BrandGlyph brand={brand} size={size} />;
  const [name, cls] = TAG_ICON[tag.icon] ?? ["sell", "g-gray"];
  return <span className={size === "large" ? `app-icon ${cls}` : `glyph ${cls}${size === "xs" ? " xs" : ""}`}><Icon name={name} fill /></span>;
}
export function TriggerIcon({ icon }: { icon: string }) {
  if (icon === "smart_display" && YOUTUBE) return <BrandGlyph brand={YOUTUBE} />;
  return <span className={`glyph ${TRIGGER_COLOR[icon] ?? "g-gray"}`}><Icon name={icon} fill /></span>;
}
export function VariableIcon({ icon }: { icon: string }) {
  return <span className="glyph g-slate"><Icon name={icon} fill /></span>;
}

function TemplateText({ text, container, open }: { text: string; container: GtmContainer; open: (item: DrawerItem) => void }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = /^\{\{([^}]+)\}\}$/.exec(part);
        if (!match) return <span key={index}>{part}</span>;
        const variable = container.variables.find((item) => item.name === match[1]);
        return variable
          ? <button type="button" className="var-ref" key={index} onClick={() => open({ kind: "variable", id: variable.id })}>{part}</button>
          : <span className="var-ref" key={index}>{part}</span>;
      })}
    </>
  );
}

function ValueView({ value, container, open, columns }: { value: ParamValue; container: GtmContainer; open: (item: DrawerItem) => void; columns?: Record<string, string> }) {
  switch (value.kind) {
    case "bool": return <span className="check" style={{ padding: 0 }}><span className={`box ${value.value ? "on" : ""}`}>{value.value && <Icon name="check" className="xs" />}</span>{value.value ? "true" : "false"}</span>;
    case "number": return <div className="value">{value.value}</div>;
    case "text": return <div className="value"><TemplateText text={value.text} container={container} open={open} /></div>;
    case "list": return value.items.length ? <div className="stack" style={{ gap: 6 }}>{value.items.map((item, index) => <ValueView key={index} value={item} container={container} open={open} />)}</div> : <div className="value faint">Empty list</div>;
    case "table": return (
      <div className="table-wrap">
        <table className="table">
          <thead><tr>{value.columns.map((column) => <th key={column}>{columns?.[column] ?? column}</th>)}</tr></thead>
          <tbody>{value.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="mono" style={{ fontSize: 12.5, overflowWrap: "anywhere" }}>{cell.kind === "text" ? <TemplateText text={cell.text} container={container} open={open} /> : cell.kind === "bool" || cell.kind === "number" ? String(cell.value) : "…"}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
}

const TABLE_COLUMNS: Record<string, string> = { parameter: "Parameter name", parameterValue: "Value", name: "Name", value: "Value", key: "Key" };

function Fields({ params, container, open }: { params: Param[]; container: GtmContainer; open: (item: DrawerItem) => void }) {
  if (!params.length) return null;
  return <>{params.map((param) => <div className="field" key={param.key}><span className="label">{param.label}</span><ValueView value={param.value} container={container} open={open} columns={TABLE_COLUMNS} /></div>)}</>;
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sub-collapse">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? "expand_more" : "chevron_right"} className="sm" /> {title}</button>
      {open && <div style={{ padding: "10px 0 0 22px" }}>{children}</div>}
    </div>
  );
}

function Check({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <div className="check"><span className={`box ${on ? "on" : ""}`}>{on && <Icon name="check" className="xs" />}</span>{children}</div>;
}

export function CodeView({ code, filename, label }: { code: string; filename: string; label: string }) {
  const [wrap, setWrap] = useState(true);
  const toast = useToast();
  const lines = code.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "").split("\n");
  const download = () => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="code-view">
      <header>
        <span>{label} · {lines.length} {lines.length === 1 ? "LINE" : "LINES"}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" className="btn" onClick={() => setWrap(!wrap)}>{wrap ? "No wrap" : "Wrap"}</button>
          <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(code).then(() => toast("Copied to clipboard"))}><Icon name="content_copy" className="xs" /> Copy</button>
          <button type="button" className="btn" onClick={download}><Icon name="download" className="xs" /> Download</button>
        </span>
      </header>
      <pre className={wrap ? "wrap" : ""}>{lines.map((line, index) => <span className="ln" key={index}>{line || " "}</span>)}</pre>
    </div>
  );
}

function LinkItem({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void }) {
  return <button type="button" className="link-item" onClick={onClick}>{icon}<span style={{ overflowWrap: "anywhere" }}>{label}</span>{sub && <small>{sub}</small>}</button>;
}

type TagTab = "overview" | "settings" | "code" | "links";

function Fact({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "live" | "paused" | "warn" }) {
  return <div className={`fact ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function TagBody({ tag, container, open }: { tag: GtmTag; container: GtmContainer; open: (item: DrawerItem) => void }) {
  const [tab, setTab] = useState<TagTab>("overview");
  const toast = useToast();
  const main = tag.params.filter((param) => param.value.kind !== "bool");
  const toggles = tag.params.filter((param) => param.value.kind === "bool");
  const byId = (id: string) => container.triggers.find((trigger) => trigger.id === id);
  const tagById = (id?: string) => container.tags.find((item) => item.id === id);
  const setup = tagById(tag.setupTag?.tag);
  const teardown = tagById(tag.teardownTag?.tag);
  const variables = [...new Set(tag.variablesUsed)].map((id) => container.variables.find((item) => item.id === id)).filter((item): item is GtmVariable => !!item);
  const tabs: Array<[TagTab, string, number | null]> = [
    ["overview", "Overview", null],
    ["settings", "Settings", main.length + toggles.length || null],
    ...(tag.html ? [["code", "Code", null] as [TagTab, string, null]] : []),
    ...(tag.ids.length || variables.length ? [["links", "Links", tag.ids.length + variables.length] as [TagTab, string, number]] : []),
  ];
  const triggerLinks = (ids: string[]) => ids.map((id) => { const trigger = byId(id)!; return <LinkItem key={id} icon={<TriggerIcon icon={trigger.icon} />} label={trigger.name} sub={trigger.type} onClick={() => open({ kind: "trigger", id })} />; });
  const copy = (value: string) => navigator.clipboard.writeText(value).then(() => toast("Copied", value));

  return (
    <>
      <div className="facts">
        <Fact label="Status" value={tag.paused ? "Paused" : "Active"} tone={tag.paused ? "paused" : "live"} />
        <Fact label="Fires on" value={`${tag.firingTriggers.length} trigger${tag.firingTriggers.length === 1 ? "" : "s"}`} tone={tag.firingTriggers.length ? undefined : "warn"} />
        <Fact label="Firing" value={tag.firingOption} />
        <Fact label="Priority" value={tag.priority ?? 0} />
        <Fact label="Consent" value={tag.consent.length ? tag.consent.join(", ") : "None extra"} />
        <Fact label="Exceptions" value={tag.blockingTriggers.length || "None"} />
      </div>

      <div className="segmented small inspector-tabs" role="tablist" aria-label="Tag details">
        {tabs.map(([key, label, count]) => (
          <button type="button" role="tab" key={key} aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
            {label}{count !== null && <em>{count}</em>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {tag.summary && <div className="summary-line">{tag.summary}</div>}
          {tag.paused && <div className="notice warn"><Icon name="pause_circle" fill className="sm" />This tag is paused. Google publishes only the type of a paused tag, not its settings.</div>}
          {tag.identifiers.length > 0 && (
            <section className="panel">
              <h3>Identifiers</h3>
              <div className="ident">
                {tag.identifiers.map((item) => (
                  <button type="button" className="ident-item" key={item.label} onClick={() => copy(item.value)} title="Copy">
                    <span>{item.label}</span><code>{item.value}</code><Icon name="content_copy" className="xs copy-hint" />
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="panel">
            <h3>Firing logic</h3>
            <ol className="flow">
              <li className="flow-step">
                <span className="flow-label">When</span>
                {tag.firingTriggers.length ? <div className="link-list">{triggerLinks(tag.firingTriggers)}</div> : <p className="muted small flow-empty">No firing trigger. This tag fires only through sequencing, or never.</p>}
              </li>
              {setup && (
                <li className="flow-step">
                  <span className="flow-label">First</span>
                  <div className="link-list"><LinkItem icon={<TagIcon tag={setup} />} label={setup.name} sub={tag.setupTag?.stopOnFailure ? "Stops if it fails" : "Setup tag"} onClick={() => open({ kind: "tag", id: setup.id })} /></div>
                </li>
              )}
              <li className="flow-step current">
                <span className="flow-label">Fire</span>
                <div className="flow-self"><TagIcon tag={tag} /><div><strong>{tagHeadline(tag, tag.firingTriggers[0] ? byId(tag.firingTriggers[0])?.name : undefined)}</strong><small>{tag.type}</small></div></div>
              </li>
              {teardown && (
                <li className="flow-step">
                  <span className="flow-label">Then</span>
                  <div className="link-list"><LinkItem icon={<TagIcon tag={teardown} />} label={teardown.name} sub="Cleanup tag" onClick={() => open({ kind: "tag", id: teardown.id })} /></div>
                </li>
              )}
              {tag.blockingTriggers.length > 0 && (
                <li className="flow-step block">
                  <span className="flow-label">Unless</span>
                  <div className="link-list">{triggerLinks(tag.blockingTriggers)}</div>
                </li>
              )}
            </ol>
          </section>
        </>
      )}

      {tab === "settings" && (
        <section className="panel">
          <h3>{tag.type}</h3>
          <Fields params={main} container={container} open={open} />
          {toggles.length > 0 && <div className="field"><span className="label">Options</span><div className="inner-box">{toggles.map((param) => <Check key={param.key} on={param.value.kind === "bool" && param.value.value}>{param.label}</Check>)}</div></div>}
          {!main.length && !toggles.length && <p className="muted small">{tag.paused ? "Paused tags publish no settings." : "This tag has no configurable settings."}</p>}
          <div className="field">
            <span className="label">Consent</span>
            <div className="inner-box">
              <Check on={!tag.consent.length}>No additional consent required</Check>
              <Check on={tag.consent.length > 0}>Require additional consent{tag.consent.length ? `: ${tag.consent.join(", ")}` : ""}</Check>
            </div>
          </div>
        </section>
      )}

      {tab === "code" && tag.html && <CodeView code={tag.html} filename={`${tag.name.replace(/[^\w.-]+/g, "_").slice(0, 60)}.html`} label="HTML" />}

      {tab === "links" && (
        <>
          {tag.ids.length > 0 && <section className="panel"><h3>IDs in this tag</h3><div className="chip-row">{tag.ids.map((id) => <button type="button" className="value-chip" key={id} onClick={() => copy(id)} title="Copy">{id}</button>)}</div></section>}
          {variables.length > 0 && <section className="panel"><h3>Variables used</h3><div className="link-list">{variables.map((variable) => <LinkItem key={variable.id} icon={<VariableIcon icon={variable.icon} />} label={variable.name} sub={variable.type} onClick={() => open({ kind: "variable", id: variable.id })} />)}</div></section>}
        </>
      )}
    </>
  );
}


function TriggerBody({ trigger, container, open }: { trigger: GtmTrigger; container: GtmContainer; open: (item: DrawerItem) => void }) {
  const plural = trigger.type === "Page View" ? "Page Views" : trigger.type === "Custom Event" ? "Custom Events" : trigger.type === "Just Links" ? "Link Clicks" : trigger.type === "All Elements" ? "Clicks" : `${trigger.type} events`;
  const tag = (id: string) => container.tags.find((item) => item.id === id)!;
  return (
    <>
      <section className="panel">
        <h3>Trigger Configuration</h3>
        <div className="field"><span className="label">Trigger Type</span><div className="typebox"><TriggerIcon icon={trigger.icon} /><div><strong>{trigger.type}</strong>{trigger.uniqueTriggerId && <small>Trigger ID {trigger.uniqueTriggerId}</small>}</div></div></div>
        <div className="field"><div className="summary-line">{trigger.summary}</div></div>
        {(trigger.eventName || trigger.eventRegex) && trigger.type === "Custom Event" && (
          <div className="field"><span className="label">Event name</span><div className="value">{trigger.eventName ?? trigger.eventRegex}</div><Check on={!!trigger.eventRegex}>Use regex matching</Check></div>
        )}
        <div className="field">
          <span className="label">This trigger fires on</span>
          <div className="radio-list">
            <div className={`radio ${trigger.conditions.length ? "" : "sel"}`}><span className="dot" /><strong>All {plural}</strong></div>
            <div className={`radio ${trigger.conditions.length ? "sel" : ""}`}><span className="dot" /><strong>Some {plural}</strong></div>
          </div>
        </div>
        {trigger.conditions.length > 0 && (
          <div className="field">
            <span className="label">Fire this trigger when an Event occurs and all of these conditions are true</span>
            <div className="table-wrap"><table className="table"><tbody>
              {trigger.conditions.map((condition, index) => (
                <tr key={index}>
                  <td>{condition.leftRef ? <button type="button" className="var-ref" onClick={() => open({ kind: "variable", id: condition.leftRef! })}>{`{{${condition.left}}}`}</button> : <code>{condition.left}</code>}</td>
                  <td style={{ color: condition.negate ? "var(--danger)" : "var(--muted)" }}>{condition.operator}</td>
                  <td className="mono" style={{ fontSize: 12.5, overflowWrap: "anywhere" }}><TemplateText text={condition.right} container={container} open={open} /></td>
                </tr>
              ))}
            </tbody></table></div>
          </div>
        )}
        {trigger.listener && trigger.listener.params.length > 0 && <Collapsible title="Listener settings" defaultOpen><Fields params={trigger.listener.params} container={container} open={open} /></Collapsible>}
      </section>
      <section className="panel">
        <h3>Tags</h3>
        <div className="field"><span className="label">Fires these tags</span><div className="link-list">{trigger.firesTags.length ? trigger.firesTags.map((id) => <LinkItem key={id} icon={<TagIcon tag={tag(id)} />} label={tag(id).name} sub={tag(id).paused ? "Paused" : tag(id).type} onClick={() => open({ kind: "tag", id })} />) : <p className="muted" style={{ margin: 0 }}>No tags use this trigger.</p>}</div></div>
        {trigger.blocksTags.length > 0 && <div className="field"><span className="label">Blocks these tags</span><div className="link-list">{trigger.blocksTags.map((id) => <LinkItem key={id} icon={<TagIcon tag={tag(id)} />} label={tag(id).name} sub={tag(id).type} onClick={() => open({ kind: "tag", id })} />)}</div></div>}
        {trigger.variablesUsed.length > 0 && <div className="field"><span className="label">Variables used</span><div className="link-list">{trigger.variablesUsed.map((id) => { const variable = container.variables.find((item) => item.id === id); return variable ? <LinkItem key={id} icon={<VariableIcon icon={variable.icon} />} label={variable.name} sub={variable.type} onClick={() => open({ kind: "variable", id })} /> : null; })}</div></div>}
      </section>
    </>
  );
}

function VariableBody({ variable, container, open }: { variable: GtmVariable; container: GtmContainer; open: (item: DrawerItem) => void }) {
  const refs = [
    ...variable.usedBy.tags.map((id) => ({ kind: "tag" as const, id, item: container.tags.find((tag) => tag.id === id) })),
    ...variable.usedBy.triggers.map((id) => ({ kind: "trigger" as const, id, item: container.triggers.find((trigger) => trigger.id === id) })),
    ...variable.usedBy.variables.map((id) => ({ kind: "variable" as const, id, item: container.variables.find((item) => item.id === id) })),
  ];
  return (
    <>
      <section className="panel">
        <h3>Variable Configuration</h3>
        <div className="field"><span className="label">Variable Type</span><div className="typebox"><VariableIcon icon={variable.icon} /><div><strong>{variable.type}</strong><small>{variable.builtIn ? "Built-in variable" : "User-defined variable"} · compiled #{variable.index}</small></div></div></div>
        {variable.description && <div className="field"><div className="summary-line">{variable.description}</div></div>}
        {variable.fn === "jsm" ? <div className="field"><span className="label">Custom JavaScript</span><CodeView code={variable.value} filename={`${variable.name.replace(/[^\w.-]+/g, "_").slice(0, 60)}.js`} label="JAVASCRIPT" /></div> : null}
        <Fields params={variable.params} container={container} open={open} />
        {!variable.params.length && variable.fn !== "jsm" && <p className="muted" style={{ margin: 0 }}>This variable has no configurable settings.</p>}
      </section>
      <section className="panel">
        <h3>References</h3>
        {refs.length ? <div className="link-list">{refs.map((ref) => ref.item ? (
          <LinkItem key={`${ref.kind}-${ref.id}`} icon={ref.kind === "tag" ? <TagIcon tag={ref.item as GtmTag} /> : ref.kind === "trigger" ? <TriggerIcon icon={(ref.item as GtmTrigger).icon} /> : <VariableIcon icon={(ref.item as GtmVariable).icon} />} label={ref.item.name} sub={ref.kind} onClick={() => open({ kind: ref.kind, id: ref.id })} />
        ) : null)}</div> : <div className="notice warn"><Icon name="warning" className="sm" /> Not referenced by any tag, trigger or variable in the published container.</div>}
      </section>
    </>
  );
}

/** Inspector for the selected tag/trigger/variable: a docked panel on wide screens, a sheet overlay otherwise. */
export function GtmDrawer({ container, stack, onOpen, onBack, onClose, docked = false }: { container: GtmContainer; stack: DrawerItem[]; onOpen: (item: DrawerItem) => void; onBack: () => void; onClose: () => void; docked?: boolean }) {
  const current = stack[stack.length - 1];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    if (docked) return () => window.removeEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, docked]);
  if (!current) return null;
  const tag = current.kind === "tag" ? container.tags.find((item) => item.id === current.id) : undefined;
  const trigger = current.kind === "trigger" ? container.triggers.find((item) => item.id === current.id) : undefined;
  const variable = current.kind === "variable" ? container.variables.find((item) => item.id === current.id) : undefined;
  const title = tag?.name ?? trigger?.name ?? variable?.name ?? "Not found";
  const kindLabel = tag ? tag.type : trigger ? `${trigger.type} trigger` : variable ? variable.type : "";
  const panel = (
    <aside className={docked ? "inspector" : "inspector floating"} role={docked ? "complementary" : "dialog"} aria-modal={docked ? undefined : true} aria-label={title}>
      <header className="inspector-head">
        <div className="inspector-nav">
          {stack.length > 1 ? <button type="button" className="text-btn" onClick={onBack}><Icon name="chevron_left" /> Back</button> : <span />}
          <button type="button" className="text-btn strong" onClick={onClose}>{docked ? <Icon name="close" /> : "Done"}</button>
        </div>
        {tag ? (
          <div className="inspector-title tag-hero">
            <TagIcon tag={tag} size="large" />
            <div>
              <p className="tag-hero-kicker">{tag.vendor ?? tag.group}</p>
              <h2>{tagHeadline(tag, container.triggers.find((item) => item.id === tag.firingTriggers[0])?.name)}</h2>
              <p><span className={`status-badge ${tag.paused ? "paused" : "live"}`}>{tag.paused ? "Paused" : "Active"}</span>{tag.type}</p>
            </div>
          </div>
        ) : (
          <div className="inspector-title">
            {trigger && <TriggerIcon icon={trigger.icon} />}
            {variable && <VariableIcon icon={variable.icon} />}
            <div><h2>{title}</h2><p>{kindLabel}</p></div>
          </div>
        )}
      </header>
      <div className="inspector-body">
        {tag && <TagBody key={tag.id} tag={tag} container={container} open={onOpen} />}
        {trigger && <TriggerBody trigger={trigger} container={container} open={onOpen} />}
        {variable && <VariableBody variable={variable} container={container} open={onOpen} />}
      </div>
    </aside>
  );
  if (docked) return panel;
  // Rendered on <body> so the glass panels (backdrop-filter) cannot trap the fixed overlay.
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>{panel}</div>,
    document.body,
  );
}
