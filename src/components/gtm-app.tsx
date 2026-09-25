"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatBytes } from "@/lib/compiled";
import { primaryId, tagHeadline } from "@/lib/gtm/present";
import { SUPPORT_URL } from "@/lib/features";
import type { GtmContainer, GtmTag, TypeCount } from "@/lib/gtm/types";
import { Icon, ProductGlyph, RelatedLinks, SiteFooter, SiteHeader, formatDateTime, useShare, useSiteContext, SoonBadge } from "./chrome";
import { GtmDrawer, TagIcon, TriggerIcon, VariableIcon, type DrawerItem } from "./gtm-drawer";
import { DiffList, HistoryPanel } from "./history";
import { SearchPanel, useInspect } from "./inspect";
import { SupportNudge } from "./support";
import { useToast } from "./toast";
import { WatchDialog } from "./watch-dialog";

type View = "overview" | "tags" | "triggers" | "variables" | "history";
type Flag = "paused" | "active" | "unused" | "noTrigger" | "user" | null;
const VIEWS: View[] = ["overview", "tags", "triggers", "variables", "history"];
type Entries = Parameters<typeof DiffList>[0]["entries"];

/** True when the window is wide enough to dock the inspector next to the list. */
function useWide(query = "(min-width: 1180px)") {
  return useSyncExternalStore(
    (notify) => { const media = matchMedia(query); media.addEventListener("change", notify); return () => media.removeEventListener("change", notify); },
    () => matchMedia(query).matches,
    () => true,
  );
}

export function GtmApp({ initialId, initialView, guide }: { initialId?: string; initialView?: string; guide?: React.ReactNode }) {
  const [value, setValue] = useState(initialId ?? "");
  const inspect = useInspect<GtmContainer>("gtm");
  const { state, run, reset } = inspect;
  const container = state.result?.model ?? null;

  // Deep links (?id=) load on mount. If the component remounts (e.g. Strict Mode), the hook aborts the
  // in-flight request on unmount and this effect simply starts it again.
  useEffect(() => {
    if (initialId) void run(initialId);
  }, [initialId, run]);

  if (container) {
    const view = initialView === "stats" ? "overview" : initialView === "versions" ? "history" : initialView;
    return <Workspace key={container.id} container={container} changes={(state.result?.changes ?? []) as Entries} refreshing={state.status === "running"}
      initialView={VIEWS.includes(view as View) ? (view as View) : "tags"}
      onRefresh={() => run(container.id, { fresh: true })}
      onBack={() => { reset(); setValue(""); window.history.replaceState(null, "", "/gtm"); }} />;
  }
  return (
    <>
      <SiteHeader />
      <main>
        <div className="page">
          <SearchPanel mode="gtm" value={value} onChange={setValue} onSubmit={(input) => void run(input)} inspect={inspect} onPick={(id) => { setValue(id); void run(id); }} sampleId="GTM-N233G8C" />
          {guide}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function Workspace({ container: c, changes, refreshing, initialView, onRefresh, onBack }: { container: GtmContainer; changes: Entries; refreshing: boolean; initialView: View; onRefresh: () => void; onBack: () => void }) {
  const [view, setView] = useState<View>(initialView);
  const [stack, setStack] = useState<DrawerItem[]>([]);
  const [watching, setWatching] = useState(false);
  const [preset, setPreset] = useState<{ flag: Flag; at: number }>({ flag: null, at: 0 });
  const share = useShare();
  const toast = useToast();
  const wide = useWide();
  const wasRefreshing = useRef(refreshing);

  useEffect(() => {
    const url = `/gtm?id=${encodeURIComponent(c.id)}${view !== "tags" ? `&view=${view}` : ""}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [c.id, view]);

  useEffect(() => {
    if (wasRefreshing.current && !refreshing) toast(changes.length ? `${changes.length} changes found` : "Up to date", changes.length ? "See the changes at the top of the list." : `This is the latest published version (v${c.version ?? "?"}).`);
    wasRefreshing.current = refreshing;
  }, [refreshing, changes.length, c.version, toast]);

  // Links inside the inspector push onto a back stack; picking a row in the list starts a fresh stack.
  const push = useCallback((item: DrawerItem) => setStack((current) => [...current, item]), []);
  const openFromList = useCallback((item: DrawerItem) => setStack([item]), []);
  const closeInspector = useCallback(() => setStack([]), []);
  const go = (next: View, flag: Flag = null) => { setView(next); setStack([]); setPreset((current) => ({ flag, at: current.at + 1 })); };
  const selectedId = stack[stack.length - 1]?.id;
  const docked = wide && stack.length > 0;
  const context = useSiteContext();
  // GA4 properties and Meta pixels this container sends data to, then other containers found on the same site.
  const related = useMemo(() => [
    ...[...new Set(c.tags.flatMap((tag) => tag.ids).filter((id) => /^G-/.test(id)))].map((id) => ({ kind: "ga4" as const, id })),
    ...[...new Set(c.tags.filter((tag) => tag.vendor === "Meta Pixel" || tag.group === "Meta Pixel").flatMap((tag) => tag.ids).filter((id) => /^\d{10,20}$/.test(id)))].map((id) => ({ kind: "meta" as const, id })),
    ...(context.gtm.includes(c.id) ? [...context.segment.map((id) => ({ kind: "segment" as const, id })), ...context.gtm.filter((id) => id !== c.id).map((id) => ({ kind: "gtm" as const, id }))] : []),
  ].slice(0, 8), [c, context]);

  const nav: Array<[View, string, string, number | null, string]> = [
    ["overview", "Overview", "space_dashboard", null, "g-gray"],
    ["tags", "Tags", "sell", c.tags.length, "g-blue"],
    ["triggers", "Triggers", "bolt", c.triggers.length, "g-orange"],
    ["variables", "Variables", "data_object", c.variables.length, "g-slate"],
    ["history", "History", "history", null, "g-purple"],
  ];

  return (
    <>
      <SiteHeader />
      <div className={`app ${docked ? "with-inspector" : ""}`}>
        <aside className="sidebar" aria-label="Container">
          <div className="sidebar-card">
            <ProductGlyph kind="gtm" size="large" />
            <div>
              <strong className="mono">{c.id}</strong>
              <small>Version {c.version ?? "?"} · {formatBytes(c.weightBytes)}</small>
            </div>
          </div>
          <nav className="source-list">
            {nav.map(([key, label, icon, count, color]) => (
              <button type="button" key={key} className={view === key ? "on" : ""} aria-current={view === key ? "page" : undefined} onClick={() => go(key)}>
                <span className={`glyph xs ${color}`}><Icon name={icon} fill /></span>{label}{count !== null && <span className="count">{count}</span>}
              </button>
            ))}
          </nav>
          <RelatedLinks title="Switch to" items={related} />
          <div className="source-title">Actions</div>
          <nav className="source-list plain">
            <button type="button" onClick={() => setWatching(true)}><Icon name="notifications" /> Follow container <SoonBadge /></button>
            <button type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" />} Check for updates</button>
            <a href={`/api/gtm/${encodeURIComponent(c.id)}/export`} download><Icon name="download" /> Export import file</a>
            <button type="button" onClick={() => share(`${window.location.origin}/gtm?id=${encodeURIComponent(c.id)}`, `${c.id} GTM container`)}><Icon name="ios_share" /> Share link</button>
            <button type="button" onClick={onBack}><Icon name="search" /> Open another</button>
            <a href={SUPPORT_URL} target="_blank" rel="noopener"><Icon name="coffee" /> Buy me a coffee</a>
          </nav>
          <p className="sidebar-foot">Read {formatDateTime(c.fetchedAt)}. Google only publishes the live version of a container.</p>
        </aside>

        <main className="content">
          {changes.length > 0 && (
            <section className="group">
              <h3 className="group-title">Changed since the last read</h3>
              <div className="list list-pad"><DiffList entries={changes} limit={8} /></div>
            </section>
          )}
          {view === "overview" && <Overview c={c} go={go} open={openFromList} />}
          {view === "overview" && <SupportNudge tool="gtm" />}
          {view === "tags" && <TagList key={`t${preset.at}`} c={c} flag={preset.flag} open={openFromList} selectedId={selectedId} />}
          {view === "triggers" && <TriggerList key={`r${preset.at}`} c={c} flag={preset.flag} open={openFromList} selectedId={selectedId} />}
          {view === "variables" && <VariableList key={`v${preset.at}`} c={c} flag={preset.flag} open={openFromList} selectedId={selectedId} />}
          {view === "history" && (
            <>
              <Toolbar title="History" subtitle="Every published version this server has read" />
              <HistoryPanel kind="gtm" target={c.id} refreshKey={c.fetchedAt} onWatch={() => setWatching(true)} />
            </>
          )}
          <p className="content-foot">TagSpy reads only the public, published container. Names are reconstructed because GTM does not publish them.</p>
        </main>

        {stack.length > 0 && <GtmDrawer container={c} stack={stack} onOpen={push} onBack={() => setStack((current) => current.slice(0, -1))} onClose={closeInspector} docked={wide} />}
      </div>
      {watching && <WatchDialog kind="gtm" target={c.id} onClose={() => setWatching(false)} />}
    </>
  );
}

function Toolbar({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="toolbar">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {children && <div className="toolbar-tools">{children}</div>}
    </div>
  );
}

/* ── List chrome ────────────────────────────────────────────────────── */

function useListState(flag: Flag) {
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [scope, setScope] = useState<Flag>(flag);
  const [menu, setMenu] = useState(false);
  const [limit, setLimit] = useState(80);
  return { query, setQuery, types, setTypes, scope, setScope, menu, setMenu, limit, setLimit };
}

function ListTools({ state, scopes, allTypes, noun }: { state: ReturnType<typeof useListState>; scopes: [Flag, string][]; allTypes: TypeCount[]; noun: string }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { menu, setMenu } = state;
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu, setMenu]);
  const toggle = (type: string) => state.setTypes(state.types.includes(type) ? state.types.filter((item) => item !== type) : [...state.types, type]);
  return (
    <>
      <div className="segmented small" role="radiogroup" aria-label="Show">
        {scopes.map(([key, label]) => <button type="button" role="radio" aria-checked={state.scope === key} key={label} className={state.scope === key ? "on" : ""} onClick={() => state.setScope(key)}>{label}</button>)}
      </div>
      <label className="search-field">
        <Icon name="search" className="sm" />
        <span className="visually-hidden">Search {noun}</span>
        <input value={state.query} onChange={(event) => state.setQuery(event.target.value)} placeholder="Search" />
        {state.query && <button type="button" aria-label="Clear search" onClick={() => state.setQuery("")}><Icon name="cancel" fill className="sm" /></button>}
      </label>
      <div className="menu-wrap" ref={menuRef}>
        <button type="button" className={`btn icon ${state.types.length ? "btn-tinted" : ""}`} aria-label="Filter by type" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          <Icon name="filter_list" className="sm" />{state.types.length > 0 && <span className="dot-count">{state.types.length}</span>}
        </button>
        {menu && (
          <div className="menu" role="menu">
            <div className="menu-title">Filter by type</div>
            {allTypes.map((type) => (
              <button type="button" role="menuitemcheckbox" aria-checked={state.types.includes(type.type)} key={type.type} onClick={() => toggle(type.type)}>
                <Icon name="check" className={`sm ${state.types.includes(type.type) ? "" : "invisible"}`} />
                <span>{type.type}</span><small>{type.count}</small>
              </button>
            ))}
            {state.types.length > 0 && <button type="button" className="menu-reset" onClick={() => state.setTypes([])}>Clear filter</button>}
          </div>
        )}
      </div>
    </>
  );
}

function Cell({ selected, onClick, icon, title, subtitle, badge }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <button type="button" className={`row-cell ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onClick}>
      {icon}
      <span className="cell-text"><strong>{title}</strong><small>{subtitle}</small></span>
      {badge}
      <Icon name="chevron_right" className="chev" />
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state"><Icon name="search_off" /><p>{text}</p></div>;
}

function More({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  return shown < total ? <div className="more-row"><button type="button" className="text-btn" onClick={onMore}>Show all {total}</button></div> : null;
}

const matches = (query: string, ...fields: (string | undefined)[]) => {
  const q = query.trim().toLowerCase();
  return !q || fields.some((field) => field?.toLowerCase().includes(q));
};

/* ── Tags ───────────────────────────────────────────────────────────── */

/** "Google Analytics: GA4 Event" → "GA4 Event": the vendor is already shown by the logo and group. */
const shortType = (type: string) => type.replace(/^Google Analytics: /, "");

/** Groups tags by destination (vendor or product): busiest live group first, active tags before paused ones. */
function groupTags(tags: GtmTag[]) {
  const groups = new Map<string, GtmTag[]>();
  for (const tag of tags) {
    const name = tag.vendor ?? tag.group;
    groups.set(name, [...(groups.get(name) ?? []), tag]);
  }
  return [...groups]
    .map(([name, items]) => ({ name, tags: [...items.filter((tag) => !tag.paused), ...items.filter((tag) => tag.paused)], paused: items.filter((tag) => tag.paused).length }))
    .sort((a, b) => (b.tags.length - b.paused) - (a.tags.length - a.paused) || b.tags.length - a.tags.length);
}

function TagList({ c, flag, open, selectedId }: { c: GtmContainer; flag: Flag; open: (item: DrawerItem) => void; selectedId?: string }) {
  const state = useListState(flag === "paused" || flag === "noTrigger" ? flag : null);
  const triggerById = useMemo(() => new Map(c.triggers.map((trigger) => [trigger.id, trigger])), [c.triggers]);
  const rows = c.tags.filter((tag) => (state.scope !== "paused" || tag.paused) && (state.scope !== "active" || !tag.paused) && (state.scope !== "noTrigger" || !tag.firingTriggers.length)
    && (!state.types.length || state.types.includes(tag.type))
    && matches(state.query, tag.name, tag.type, tag.vendor, ...tag.ids, ...tag.firingTriggers.map((id) => triggerById.get(id)?.name)));
  return (
    <>
      <Toolbar title="Tags" subtitle={`${rows.length} of ${c.tags.length} · ${c.stats.active} active, ${c.stats.paused} paused`}>
        <ListTools state={state} noun="tags" allTypes={c.stats.tagsByType} scopes={[[null, "All"], ["active", "Active"], ["paused", "Paused"], ["noTrigger", "No trigger"]]} />
      </Toolbar>
      {groupTags(rows.slice(0, state.limit)).map(({ name, tags, paused }) => (
        <section className="tag-group" key={name} aria-label={name}>
          <header className="tag-group-head">
            <TagIcon tag={tags[0]} size="xs" />
            <h3>{name}</h3>
            <span className="tag-group-count">{tags.length}{paused ? ` · ${paused} paused` : ""}</span>
          </header>
          <div className="rows">
            {tags.map((tag) => {
              const first = tag.firingTriggers[0] ? triggerById.get(tag.firingTriggers[0]) : undefined;
              const id = primaryId(tag);
              return (
                <button type="button" key={tag.id} className={`row-cell tag-row ${selectedId === tag.id ? "selected" : ""} ${tag.paused ? "is-paused" : ""}`} aria-pressed={selectedId === tag.id} onClick={() => open({ kind: "tag", id: tag.id })}>
                  <TagIcon tag={tag} />
                  <span className="cell-text">
                    <strong>{tagHeadline(tag, first?.name)}</strong>
                    <small>
                      <span className="tag-type">{shortType(tag.type)}</span>
                      {first ? <span className="tag-trigger"><Icon name="bolt" fill className="xs" />{first.name}{tag.firingTriggers.length > 1 && <em>+{tag.firingTriggers.length - 1}</em>}</span> : <span className="tag-trigger none">No trigger</span>}
                    </small>
                  </span>
                  {id && <code className="id-chip">{id}</code>}
                  <span className={`status-dot ${tag.paused ? "paused" : "live"}`} title={tag.paused ? "Paused" : "Active"}><span className="visually-hidden">{tag.paused ? "Paused" : "Active"}</span></span>
                  <Icon name="chevron_right" className="chev" />
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {!rows.length && <div className="rows"><Empty text="No tags match." /></div>}
      <More shown={Math.min(state.limit, rows.length)} total={rows.length} onMore={() => state.setLimit(Infinity)} />
    </>
  );
}

/* ── Triggers ───────────────────────────────────────────────────────── */

function TriggerList({ c, flag, open, selectedId }: { c: GtmContainer; flag: Flag; open: (item: DrawerItem) => void; selectedId?: string }) {
  const state = useListState(flag === "unused" ? "unused" : null);
  const rows = c.triggers.filter((trigger) => (state.scope !== "unused" || trigger.unused) && (!state.types.length || state.types.includes(trigger.type))
    && matches(state.query, trigger.name, trigger.type, trigger.eventName, ...trigger.conditions.map((condition) => `${condition.left} ${condition.right}`)));
  return (
    <>
      <Toolbar title="Triggers" subtitle={`${rows.length} of ${c.triggers.length}${c.stats.unusedTriggers ? ` · ${c.stats.unusedTriggers} unused` : ""}`}>
        <ListTools state={state} noun="triggers" allTypes={c.stats.triggersByType} scopes={[[null, "All"], ["unused", "Unused"]]} />
      </Toolbar>
      <div className="rows">
        {rows.slice(0, state.limit).map((trigger) => (
          <Cell key={trigger.id} selected={selectedId === trigger.id} onClick={() => open({ kind: "trigger", id: trigger.id })} icon={<TriggerIcon icon={trigger.icon} />} title={trigger.name}
            subtitle={<>{trigger.type} · {trigger.conditions.length ? `${trigger.conditions.length} condition${trigger.conditions.length === 1 ? "" : "s"}` : "No filters"} · fires {trigger.firesTags.length} tag{trigger.firesTags.length === 1 ? "" : "s"}</>}
            badge={trigger.unused ? <span className="pill pill-orange">Unused</span> : undefined} />
        ))}
        {!rows.length && <Empty text="No triggers match." />}
      </div>
      <More shown={Math.min(state.limit, rows.length)} total={rows.length} onMore={() => state.setLimit(Infinity)} />
    </>
  );
}

/* ── Variables ──────────────────────────────────────────────────────── */

function VariableList({ c, flag, open, selectedId }: { c: GtmContainer; flag: Flag; open: (item: DrawerItem) => void; selectedId?: string }) {
  const state = useListState(flag === "unused" ? "unused" : null);
  const rows = c.variables.filter((variable) => (state.scope !== "unused" || variable.unused) && (state.scope !== "user" || !variable.builtIn) && (!state.types.length || state.types.includes(variable.type))
    && matches(state.query, variable.name, variable.type, variable.value));
  return (
    <>
      <Toolbar title="Variables" subtitle={`${rows.length} of ${c.variables.length} · ${c.stats.unusedVariables} unused`}>
        <ListTools state={state} noun="variables" allTypes={c.stats.variablesByType} scopes={[[null, "All"], ["user", "User-defined"], ["unused", "Unused"]]} />
      </Toolbar>
      <div className="rows">
        {rows.slice(0, state.limit).map((variable) => (
          <Cell key={variable.id} selected={selectedId === variable.id} onClick={() => open({ kind: "variable", id: variable.id })} icon={<VariableIcon icon={variable.icon} />} title={variable.name}
            subtitle={<>{variable.type}{variable.builtIn ? " · Built-in" : ""}{variable.value && variable.fn !== "jsm" ? <> · <span className="mono">{variable.value.slice(0, 60)}</span></> : ""}</>}
            badge={variable.unused ? <span className="pill pill-orange">Unused</span> : undefined} />
        ))}
        {!rows.length && <Empty text="No variables match." />}
      </div>
      <More shown={Math.min(state.limit, rows.length)} total={rows.length} onMore={() => state.setLimit(Infinity)} />
    </>
  );
}

/* ── Overview ───────────────────────────────────────────────────────── */

function TypeBars({ title, items, icon }: { title: string; items: TypeCount[]; icon: (item: TypeCount) => React.ReactNode }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className="group">
      <h3 className="group-title">{title}</h3>
      <div className="list">
        {items.map((item) => (
          <div className="cell bar-cell" key={item.type}>
            {icon(item)}
            <span className="cell-text"><strong>{item.type}</strong><span className="bar"><span style={{ width: `${(item.count / max) * 100}%` }} /></span></span>
            <span className="cell-side value">{item.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Overview({ c, go, open }: { c: GtmContainer; go: (view: View, flag?: Flag) => void; open: (item: DrawerItem) => void }) {
  const s = c.stats;
  const health: Array<[string, string, number, string, () => void, boolean]> = [
    ["pause_circle", "Paused tags", s.paused, "g-gray", () => go("tags", "paused"), false],
    ["link_off", "Tags with no trigger", s.tagsWithoutTrigger, "g-gray", () => go("tags", "noTrigger"), false],
    ["bolt", "Unused triggers", s.unusedTriggers, "g-orange", () => go("triggers", "unused"), s.unusedTriggers > 0],
    ["data_object", "Unused variables", s.unusedVariables, "g-orange", () => go("variables", "unused"), s.unusedVariables > 0],
    ["code", "Custom HTML & JavaScript", s.customCode, "g-indigo", () => go("tags"), false],
  ];
  return (
    <>
      <Toolbar title="Overview" subtitle={`${c.id} · version ${c.version ?? "?"}`} />
      <div className="tiles">
        <button type="button" className="tile" onClick={() => go("tags")}><span>Tags</span><strong>{c.tags.length}</strong></button>
        <button type="button" className="tile" onClick={() => go("triggers")}><span>Triggers</span><strong>{c.triggers.length}</strong></button>
        <button type="button" className="tile" onClick={() => go("variables")}><span>Variables</span><strong>{c.variables.length}</strong></button>
        <div className="tile"><span>Destinations</span><strong>{c.destinations.filter((group) => group.ids.length).length}</strong></div>
        <div className="tile"><span>IDs</span><strong>{c.ids.length}</strong></div>
        <div className="tile"><span>Weight · {c.weightLabel}</span><strong>{formatBytes(c.weightBytes)}</strong></div>
      </div>

      <section className="group">
        <h3 className="group-title">Health</h3>
        <div className="list">
          {health.map(([icon, label, count, color, action, warn]) => (
            <button type="button" className="cell" key={label} onClick={action}>
              <span className={`glyph ${color}`}><Icon name={icon} fill /></span>
              <span className="cell-text"><strong>{label}</strong></span>
              <span className={`cell-side value ${warn ? "warn" : ""}`}>{count}<Icon name="chevron_right" className="chev" /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="group">
        <h3 className="group-title">Where data goes</h3>
        <div className="dest-grid">
          {c.destinations.map((group) => (
            <div className="dest-card" key={group.name}>
              <header><TagIcon tag={{ icon: group.icon, group: group.name }} /><div><strong>{group.name}</strong><small>{group.tagCount} tag{group.tagCount === 1 ? "" : "s"}{group.pausedCount ? ` · ${group.pausedCount} paused` : ""}</small></div></header>
              {group.ids.length ? group.ids.map((item) => <div className="kv-line" key={item.id}><span>{item.label}</span><code>{item.id}</code></div>) : <p className="muted small">No fixed ID published</p>}
              {group.ids.length > 0 && group.tagsWithoutId > 0 && <p className="muted small">+{group.tagsWithoutId} tag{group.tagsWithoutId === 1 ? "" : "s"} without a published ID</p>}
              <div className="dest-tags">
                {group.tags.slice(0, 3).map((id) => { const tag = c.tags.find((item) => item.id === id)!; return <button type="button" key={id} className="text-btn small" onClick={() => open({ kind: "tag", id })}>{tag.name}</button>; })}
                {group.tags.length > 3 && <span className="muted small">and {group.tags.length - 3} more</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="columns-3">
        <TypeBars title="Tags by type" items={s.tagsByType} icon={(item) => <TagIcon tag={{ icon: item.icon, type: item.type }} />} />
        <TypeBars title="Triggers by type" items={s.triggersByType} icon={(item) => <TriggerIcon icon={item.icon} />} />
        <TypeBars title="Variables by type" items={s.variablesByType} icon={(item) => <VariableIcon icon={item.icon} />} />
      </div>
    </>
  );
}
