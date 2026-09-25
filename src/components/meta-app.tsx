"use client";

import { useEffect, useState } from "react";
import type { MetaPixelReport as Report } from "@/lib/meta/types";
import { Icon, RelatedLinks, SiteFooter, SiteHeader, useShare, useSiteContext } from "./chrome";
import { DiffList, HistoryPanel } from "./history";
import { SearchPanel, useInspect } from "./inspect";
import { SupportNudge } from "./support";
import { MetaReport } from "./meta-report";
import { Sheet } from "./sheet";
import { WatchBanner, WatchDialog } from "./watch-dialog";

export const SAMPLE_PIXEL = "1882987898627194";

export function MetaApp({ initialId, guide }: { initialId?: string; guide?: React.ReactNode }) {
  const [value, setValue] = useState(initialId ?? "");
  const [watching, setWatching] = useState(false);
  const [history, setHistory] = useState(false);
  const inspect = useInspect<Report>("meta");
  const { state, run } = inspect;
  const share = useShare();
  const report = state.result?.model ?? null;
  const changes = (state.result?.changes ?? []) as Parameters<typeof DiffList>[0]["entries"];
  const context = useSiteContext();
  // Containers and GA4 properties found on the same site, and its other pixels.
  const related = report && context.meta.includes(report.pixelId)
    ? [
      ...context.gtm.map((id) => ({ kind: "gtm" as const, id })),
      ...context.ga4.filter((id) => id.startsWith("G-")).map((id) => ({ kind: "ga4" as const, id })),
      ...context.meta.filter((id) => id !== report.pixelId).map((id) => ({ kind: "meta" as const, id })),
      ...context.segment.map((id) => ({ kind: "segment" as const, id })),
    ]
    : [];

  // Deep links (?id= or ?q=) load on mount; the inspect hook aborts a request left running by a remount.
  useEffect(() => {
    if (initialId) void run(initialId);
  }, [initialId, run]);

  useEffect(() => {
    if (!report) return;
    const url = `/meta?id=${encodeURIComponent(report.pixelId)}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [report]);

  const submit = (input: string, fresh = false) => { setHistory(false); void run(input, { fresh }); };

  return (
    <>
      <SiteHeader />
      <main>
        <div className="page">
          <SearchPanel mode="meta" compact={!!report} value={value} onChange={setValue} onSubmit={(input) => submit(input)} inspect={inspect} onPick={(id) => { setValue(id); submit(id); }} sampleId={SAMPLE_PIXEL} />
          {report && (
            <>
              {changes.length > 0 && (
                <section className="group">
                  <h3 className="group-title">Changed since the last read</h3>
                  <div className="list list-pad"><DiffList entries={changes} limit={12} /></div>
                </section>
              )}
              <RelatedLinks title="Also on this site" items={related} />
              <MetaReport report={report} onWatch={() => setWatching(true)} onShare={() => share(`${window.location.origin}/meta?id=${report.pixelId}`, `Meta Pixel ${report.pixelId}`)} onRefresh={() => submit(report.pixelId, true)} refreshing={state.status === "running"} />
              <section className="group">
                <h3 className="group-title">History</h3>
                <div className="list">
                  <button type="button" className="cell" aria-haspopup="dialog" onClick={() => setHistory(true)}>
                    <span className="glyph g-gray"><Icon name="history" fill /></span>
                    <span className="cell-text"><strong>Change history</strong><small>Versions of this pixel&apos;s configuration observed by this server</small></span>
                    <span className="cell-side"><Icon name="chevron_right" className="chev" /></span>
                  </button>
                </div>
              </section>
              <WatchBanner kind="meta" target={report.pixelId} variant="bottom" onWatch={() => setWatching(true)} />
              <SupportNudge tool="meta" />
            </>
          )}
          {guide}
        </div>
      </main>
      <SiteFooter />
      {history && report && <Sheet title="Change history" subtitle={`Pixel ${report.pixelId}`} wide onClose={() => setHistory(false)}><HistoryPanel kind="meta" target={report.pixelId} onWatch={() => { setHistory(false); setWatching(true); }} /></Sheet>}
      {watching && report && <WatchDialog kind="meta" target={report.pixelId} onClose={() => setWatching(false)} />}
    </>
  );
}
