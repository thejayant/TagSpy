"use client";

import { useEffect, useState } from "react";
import type { SegmentReport as Report } from "@/lib/segment/types";
import { Icon, RelatedLinks, SiteFooter, SiteHeader, useShare, useSiteContext } from "./chrome";
import { DiffList, HistoryPanel } from "./history";
import { SearchPanel, useInspect } from "./inspect";
import { SupportNudge } from "./support";
import { SegmentReport } from "./segment-report";
import { Sheet } from "./sheet";
import { WatchBanner, WatchDialog } from "./watch-dialog";

export const SAMPLE_WRITE_KEY = "NBBzVMlQO9GFFqU6upGyk4gqf6zV28TH";

export function SegmentApp({ initialId, guide }: { initialId?: string; guide?: React.ReactNode }) {
  const [value, setValue] = useState(initialId ?? "");
  const [watching, setWatching] = useState(false);
  const [history, setHistory] = useState(false);
  const inspect = useInspect<Report>("segment");
  const { state, run } = inspect;
  const share = useShare();
  const report = state.result?.model ?? null;
  const changes = (state.result?.changes ?? []) as Parameters<typeof DiffList>[0]["entries"];
  const context = useSiteContext();
  // Containers, GA4 properties and pixels found on the same site, plus the GA4 IDs and pixels its destinations send to.
  const related = report
    ? [...new Map([
      ...(context.segment.includes(report.writeKey) ? [
        ...context.gtm.map((id) => ({ kind: "gtm" as const, id })),
        ...context.ga4.filter((id) => id.startsWith("G-")).map((id) => ({ kind: "ga4" as const, id })),
        ...context.meta.map((id) => ({ kind: "meta" as const, id })),
      ] : []),
      ...report.destinations.flatMap((item) => item.ids).filter((id) => id.link).map((id) => ({ kind: id.link!.slice(1, id.link!.indexOf("?")) as "ga4" | "gtm" | "meta", id: id.value })),
    ].map((item) => [item.id, item])).values()]
    : [];

  // Deep links (?id= or ?q=) load on mount; the inspect hook aborts a request left running by a remount.
  useEffect(() => {
    if (initialId) void run(initialId);
  }, [initialId, run]);

  useEffect(() => {
    if (!report) return;
    const url = `/segment?id=${encodeURIComponent(report.writeKey)}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [report]);

  const submit = (input: string, fresh = false) => { setHistory(false); void run(input, { fresh }); };

  return (
    <>
      <SiteHeader />
      <main>
        <div className="page">
          <SearchPanel mode="segment" compact={!!report} value={value} onChange={setValue} onSubmit={(input) => submit(input)} inspect={inspect} onPick={(id) => { setValue(id); submit(id); }} sampleId={SAMPLE_WRITE_KEY} />
          {report && (
            <>
              {changes.length > 0 && (
                <section className="group">
                  <h3 className="group-title">Changed since the last read</h3>
                  <div className="list list-pad"><DiffList entries={changes} limit={12} /></div>
                </section>
              )}
              <RelatedLinks title="Also on this site" items={related} />
              <SegmentReport report={report} onWatch={() => setWatching(true)} onShare={() => share(`${window.location.origin}/segment?id=${report.writeKey}`, `Segment source ${report.writeKey}`)} onRefresh={() => submit(report.writeKey, true)} refreshing={state.status === "running"} />
              <section className="group">
                <h3 className="group-title">History</h3>
                <div className="list">
                  <button type="button" className="cell" aria-haspopup="dialog" onClick={() => setHistory(true)}>
                    <span className="glyph g-gray"><Icon name="history" fill /></span>
                    <span className="cell-text"><strong>Change history</strong><small>Versions of this source&apos;s settings observed by this server</small></span>
                    <span className="cell-side"><Icon name="chevron_right" className="chev" /></span>
                  </button>
                </div>
              </section>
              <WatchBanner kind="segment" target={report.writeKey} variant="bottom" onWatch={() => setWatching(true)} />
              <SupportNudge tool="segment" />
            </>
          )}
          {guide}
        </div>
      </main>
      <SiteFooter />
      {history && report && <Sheet title="Change history" subtitle={`Source ${report.writeKey}`} wide onClose={() => setHistory(false)}><HistoryPanel kind="segment" target={report.writeKey} onWatch={() => { setHistory(false); setWatching(true); }} /></Sheet>}
      {watching && report && <WatchDialog kind="segment" target={report.writeKey} onClose={() => setWatching(false)} />}
    </>
  );
}
