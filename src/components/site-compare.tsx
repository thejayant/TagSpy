"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { SiteReport as Report, Tech } from "@/lib/site/types";
import { Icon } from "./chrome";
import { Steps, useInspect } from "./inspect";
import { GROUPS, TechGlyph } from "./site-report";

const kb = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);
const short = (version: string | null) => (version ? version.replace(/^(\d+\.\d+(?:\.\d+)?)[-+].*$/, "$1") : "");

/** Side-by-side Site DNA of two websites: how each is built and where they differ. */
export function SiteCompare({ a, b }: { a: string; b: string }) {
  const left = useInspect<Report>("site");
  const right = useInspect<Report>("site");
  const runLeft = left.run;
  const runRight = right.run;
  useEffect(() => { void runLeft(a); void runRight(b); }, [a, b, runLeft, runRight]);
  const x = left.state.result?.model ?? null;
  const y = right.state.result?.model ?? null;

  return (
    <div className="report compare">
      <header className="summary">
        <div className="summary-id">
          <span className="app-icon g-purple"><Icon name="compare_arrows" fill /></span>
          <div>
            <p className="eyebrow">Site DNA · compare</p>
            <h2 className="site-host">{x?.host ?? a} <span className="muted">vs</span> {y?.host ?? b}</h2>
          </div>
        </div>
        <div className="summary-actions">
          <Link className="btn" href={`/site?url=${encodeURIComponent(a)}`}>Open {a}</Link>
          <Link className="btn" href={`/site?url=${encodeURIComponent(b)}`}>Open {b}</Link>
        </div>
      </header>

      <div className="compare-grid">
        {[{ side: left, report: x, label: a }, { side: right, report: y, label: b }].map(({ side, report, label }) => (
          <section className="recipe" key={label}>
            <span className="recipe-kicker"><Icon name="auto_awesome" fill className="sm" /> {report?.host ?? label}</span>
            {report ? <p>{report.recipe}</p> : side.state.status === "error" ? <div className="alert-card" role="alert"><Icon name="error" fill /><span>{side.state.error}</span></div> : <Steps logs={side.state.logs} running={side.state.status === "running"} progress={side.state.progress} onCancel={side.cancel} />}
          </section>
        ))}
      </div>

      {x && y && <Comparison x={x} y={y} />}
    </div>
  );
}

function Comparison({ x, y }: { x: Report; y: Report }) {
  const names = new Map<string, Tech>();
  for (const tech of [...x.techs, ...y.techs]) if (!names.has(tech.name)) names.set(tech.name, tech);
  const inX = new Map(x.techs.map((tech) => [tech.name, tech]));
  const inY = new Map(y.techs.map((tech) => [tech.name, tech]));
  const shared = [...names.keys()].filter((name) => inX.has(name) && inY.has(name)).length;
  const cell = (tech: Tech | undefined) => (tech ? <span className="cmp-yes"><Icon name="check" className="xs" /> {short(tech.version)}</span> : <span className="cmp-no">—</span>);
  const signals = x.experience.map((signal) => ({ label: signal.label, x: signal.on, y: y.experience.find((item) => item.key === signal.key)?.on ?? false }));
  const stats: [string, string, string][] = [
    ["Technologies", String(x.techs.length), String(y.techs.length)],
    ["JavaScript read", kb(x.totals.js), kb(y.totals.js)],
    ["CSS read", kb(x.totals.css), kb(y.totals.css)],
    ["Font families", String(x.fonts.length), String(y.fonts.length)],
    ["Custom shaders", String(x.shaders), String(y.shaders)],
    ["CSS custom properties", String(x.tokens.customProperties), String(y.tokens.customProperties)],
    ["Hosting", x.techs.filter((tech) => ["Hosting", "CDN"].includes(tech.category)).map((tech) => tech.name).join(", ") || "—", y.techs.filter((tech) => ["Hosting", "CDN"].includes(tech.category)).map((tech) => tech.name).join(", ") || "—"],
  ];
  return (
    <>
      <div className="insights">
        <div className="insight info"><Icon name="join_inner" fill className="sm" /><span>{shared} technologies in common; {x.techs.length - shared} only on {x.host}, {y.techs.length - shared} only on {y.host}.</span></div>
      </div>

      <section className="group">
        <h3 className="group-title">At a glance</h3>
        <div className="table-wrap">
          <table className="table cmp-table">
            <thead><tr><th /><th>{x.host}</th><th>{y.host}</th></tr></thead>
            <tbody>{stats.map(([label, a, b]) => <tr key={label}><td>{label}</td><td>{a}</td><td>{b}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="group">
        <h3 className="group-title">Stack</h3>
        <div className="table-wrap">
          <table className="table cmp-table">
            <thead><tr><th>Technology</th><th>{x.host}</th><th>{y.host}</th></tr></thead>
            <tbody>
              {GROUPS.map((group) => {
                const rows = [...names.values()].filter((tech) => group.categories.includes(tech.category));
                if (!rows.length) return null;
                return [
                  <tr className="cmp-group" key={group.title}><td colSpan={3}><Icon name={group.icon} className="xs" /> {group.title}</td></tr>,
                  ...rows.map((tech) => (
                    <tr key={tech.name} className={inX.has(tech.name) !== inY.has(tech.name) ? "cmp-diff" : ""}>
                      <td><span className="cmp-name"><TechGlyph tech={tech} size="xs" /> {tech.name}</span></td>
                      <td>{cell(inX.get(tech.name))}</td>
                      <td>{cell(inY.get(tech.name))}</td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="group">
        <h3 className="group-title">Motion & experience</h3>
        <div className="table-wrap">
          <table className="table cmp-table">
            <thead><tr><th /><th>{x.host}</th><th>{y.host}</th></tr></thead>
            <tbody>{signals.map((signal) => <tr key={signal.label} className={signal.x !== signal.y ? "cmp-diff" : ""}><td>{signal.label}</td><td>{signal.x ? <span className="cmp-yes"><Icon name="check" className="xs" /></span> : <span className="cmp-no">—</span>}</td><td>{signal.y ? <span className="cmp-yes"><Icon name="check" className="xs" /></span> : <span className="cmp-no">—</span>}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <div className="compare-grid">
        {[x, y].map((report) => (
          <section className="list list-pad" key={report.host}>
            <div className="sublabel">Typefaces · {report.host}</div>
            <div className="chip-row">{report.fonts.length ? report.fonts.map((face) => <span className="chip" key={face.family}>{face.file?.family ?? face.family} <span className="muted">· {face.source}</span></span>) : <span className="muted">None found</span>}</div>
            <div className="sublabel">Palette</div>
            <div className="cmp-palette">{report.tokens.colors.slice(0, 16).map((color) => <span key={color.value} className="swatch-chip small" style={{ background: color.value }} title={`${color.value}${color.variable ? ` (${color.variable})` : ""}`} />)}</div>
          </section>
        ))}
      </div>
    </>
  );
}
