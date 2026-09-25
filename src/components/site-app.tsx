"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SiteReport as Report } from "@/lib/site/types";
import { SiteFooter, SiteHeader, useShare } from "./chrome";
import { DiffList, HistoryPanel } from "./history";
import { SearchPanel, useInspect } from "./inspect";
import { Sheet } from "./sheet";
import { SiteCompare } from "./site-compare";
import { DeepScanCard, SiteReport, type DeepScan } from "./site-report";
import { WatchDialog } from "./watch-dialog";

export const SAMPLE_SITE = "gravity-design.de";

/** The scanned address without the scheme or a trailing slash, keeping any path (rockstargames.com/VI). */
export const address = (report: Report) => report.finalUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The key snapshots and alerts use (the same rule as siteAddress on the server). */
const watchKey = (report: Report) => {
  const url = new URL(report.finalUrl);
  return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`;
};

export interface DeepStatus { enabled: boolean; provider: string | null; reason: string | null; storage: string; perVisit: number; remaining: number }

export function SiteApp({ initialUrl, initialVs }: { initialUrl?: string; initialVs?: string }) {
  const [value, setValue] = useState(initialUrl ?? "");
  const inspect = useInspect<Report>("site");
  const deep = useInspect<Report>("site", "/api/site/deep");
  const [status, setStatus] = useState<DeepStatus | null>(null);
  const [watching, setWatching] = useState(false);
  const [history, setHistory] = useState(false);
  const { state, run } = inspect;
  const share = useShare();
  const router = useRouter();
  const scanned = state.result?.model ?? null;
  // A finished deep scan replaces the static report for the same site.
  const deepReport = deep.state.result?.model ?? null;
  const report = deepReport && (!scanned || deepReport.host === scanned.host) ? deepReport : scanned;
  // When the plain read is blocked, a real browser often still gets through: offer the deep scan right there.
  const blocked = !report && state.status === "error" && /bot protection|refused the request|answered HTTP/.test(state.error);
  const changes = (state.result?.changes ?? []) as Parameters<typeof DiffList>[0]["entries"];

  useEffect(() => {
    if (initialUrl && !initialVs) void run(initialUrl);
  }, [initialUrl, initialVs, run]);

  // Availability and this visit's remaining deep scans; re-read after each deep scan ends.
  const deepStatus = deep.state.status;
  useEffect(() => {
    if (deepStatus === "running") return;
    let alive = true;
    fetch("/api/site/deep", { cache: "no-store" }).then((response) => response.json()).then((body) => { if (alive) setStatus(body); }).catch(() => {});
    return () => { alive = false; };
  }, [deepStatus]);

  useEffect(() => {
    if (!scanned || scanned.source !== "url") return;
    const url = `/site?url=${encodeURIComponent(address(scanned))}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [scanned]);

  const submit = (input: string, fresh = false) => { deep.reset(); void run(input, { fresh }); };

  if (initialUrl && initialVs) {
    return (
      <>
        <SiteHeader />
        <main><div className="page"><SiteCompare a={initialUrl} b={initialVs} /></div></main>
        <SiteFooter />
      </>
    );
  }

  const deepTarget = report?.source === "url" ? report.finalUrl : blocked ? value.trim() : "";
  const deepScan: DeepScan | undefined = deepTarget ? { status, state: deep.state, run: () => void deep.run(deepTarget), cancel: deep.cancel } : undefined;

  return (
    <>
      <SiteHeader />
      <main>
        <div className="page">
          <SearchPanel mode="site" compact={!!report} value={value} onChange={setValue} onSubmit={(input) => submit(input)} inspect={inspect} onPick={(id) => { setValue(id); submit(id); }} sampleId={SAMPLE_SITE} />
          {blocked && deepScan && status?.enabled && <DeepScanCard deep={deepScan} runtime={null} />}
          {report && (
            <>
              {changes.length > 0 && (
                <section className="group">
                  <h3 className="group-title">Changed since the last scan</h3>
                  <div className="list list-pad"><DiffList entries={changes} limit={12} /></div>
                </section>
              )}
              <SiteReport report={report} refreshing={state.status === "running"} deep={deepScan}
                onRefresh={report.source === "url" ? () => submit(report.finalUrl, true) : undefined}
                onShare={report.source === "url" ? () => share(`${window.location.origin}/site?url=${encodeURIComponent(address(report))}`, `How ${report.host} is built`) : undefined}
                onWatch={report.source === "url" ? () => setWatching(true) : undefined}
                onHistory={report.source === "url" ? () => setHistory(true) : undefined}
                onCompare={report.source === "url" ? (other) => router.push(`/site?url=${encodeURIComponent(address(report))}&vs=${encodeURIComponent(other)}`) : undefined} />
            </>
          )}
        </div>
      </main>
      <SiteFooter />
      {history && report && <Sheet title="Change history" subtitle={watchKey(report)} wide onClose={() => setHistory(false)}><HistoryPanel kind="site" target={watchKey(report)} onWatch={() => { setHistory(false); setWatching(true); }} /></Sheet>}
      {watching && report && <WatchDialog kind="site" target={watchKey(report)} onClose={() => setWatching(false)} />}
    </>
  );
}
