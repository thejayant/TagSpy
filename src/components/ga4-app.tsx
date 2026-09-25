"use client";

import { useEffect, useState } from "react";
import type { Ga4Report as Report } from "@/lib/ga4/types";
import { Icon, RelatedLinks, SiteFooter, SiteHeader, useShare, useSiteContext } from "./chrome";
import { Ga4Report } from "./ga4-report";
import { DiffList, HistoryPanel } from "./history";
import { SearchPanel, useInspect } from "./inspect";
import { SupportNudge } from "./support";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { WatchBanner, WatchDialog } from "./watch-dialog";

export const SAMPLE_GA4 = "G-6SET8QZ3TV";

export function Ga4App({ initialId, guide }: { initialId?: string; guide?: React.ReactNode }) {
  const [value, setValue] = useState(initialId ?? "");
  const [watching, setWatching] = useState(false);
  const [history, setHistory] = useState(false);
  const inspect = useInspect<Report>("ga4");
  const { state, run } = inspect;
  const share = useShare();
  const toast = useToast();
  const report = state.result?.model ?? null;
  const context = useSiteContext();
  // Containers and Meta pixels found on the same site, and other GA4 properties of that site.
  const related = report && (context.ga4.includes(report.measurementId) || context.ga4.includes(report.requestedId.toUpperCase()))
    ? [...context.gtm.map((id) => ({ kind: "gtm" as const, id })), ...context.meta.map((id) => ({ kind: "meta" as const, id })), ...context.segment.map((id) => ({ kind: "segment" as const, id })), ...context.ga4.filter((id) => id !== report.measurementId && id !== report.requestedId.toUpperCase() && id.startsWith("G-")).map((id) => ({ kind: "ga4" as const, id }))]
    : [];
  const changes = (state.result?.changes ?? []) as Parameters<typeof DiffList>[0]["entries"];

  // Deep links (?id=) load on mount. If the component remounts (e.g. Strict Mode), the hook aborts the
  // in-flight request on unmount and this effect simply starts it again.
  useEffect(() => {
    if (initialId) void run(initialId);
  }, [initialId, run]);

  useEffect(() => {
    if (!report) return;
    const url = `/ga4?id=${encodeURIComponent(report.measurementId)}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
    if (report.measurementId === SAMPLE_GA4 && value === SAMPLE_GA4) toast("Demo loaded", `Live configuration for ${SAMPLE_GA4}.`);
    // Only react to a new report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const submit = (input: string, fresh = false) => { setHistory(false); void run(input, { fresh }); };
  const shareUrl = () => `${window.location.origin}/ga4?id=${encodeURIComponent(report!.measurementId)}`;

  return (
    <>
      <SiteHeader />
      <main>
        <div className="page">
          <SearchPanel mode="ga4" compact={!!report} value={value} onChange={setValue} onSubmit={(input) => submit(input)} inspect={inspect} onPick={(id) => { setValue(id); submit(id); }} sampleId={SAMPLE_GA4} />
          {report && (
            <>
              {changes.length > 0 && (
                <section className="group">
                  <h3 className="group-title">Changed since the last read</h3>
                  <div className="list list-pad"><DiffList entries={changes} limit={12} /></div>
                </section>
              )}
              <RelatedLinks title="Also on this site" items={related} />
              <Ga4Report report={report} onWatch={() => setWatching(true)} onShare={() => share(shareUrl(), `${report.measurementId} GA4 setup`)} onRefresh={() => submit(report.measurementId, true)} refreshing={state.status === "running"} />
              <section className="group">
                <h3 className="group-title">History</h3>
                <div className="list">
                  <button type="button" className="cell" aria-haspopup="dialog" onClick={() => setHistory(true)}>
                    <span className="glyph g-gray"><Icon name="history" fill /></span>
                    <span className="cell-text"><strong>Change history</strong><small>Versions of this property observed by this server</small></span>
                    <span className="cell-side"><Icon name="chevron_right" className="chev" /></span>
                  </button>
                </div>
              </section>
              <WatchBanner kind="ga4" target={report.measurementId} variant="bottom" onWatch={() => setWatching(true)} />
              <SupportNudge tool="ga4" />
            </>
          )}
          {guide}
        </div>
      </main>
      <SiteFooter />
      {history && report && <Sheet title="Change history" subtitle={report.measurementId} wide onClose={() => setHistory(false)}><HistoryPanel kind="ga4" target={report.measurementId} onWatch={() => { setHistory(false); setWatching(true); }} /></Sheet>}
      {watching && report && <WatchDialog kind="ga4" target={report.measurementId} onClose={() => setWatching(false)} />}
    </>
  );
}
