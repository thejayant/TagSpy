import { dueTargets } from "@/lib/db";
import { envNumber } from "@/lib/env";
import { checkTarget } from "@/lib/service";

/** Re-reads every watched GA4 property / GTM container once per interval and notifies watchers of changes. */
const intervalHours = Math.max(0.05, envNumber("WATCH_INTERVAL_HOURS", 24));
const pollMs = Math.max(10_000, envNumber("WATCH_POLL_SECONDS", 300) * 1000);
let stopping = false;

async function tick() {
  const due = dueTargets(new Date(Date.now() - intervalHours * 3600_000).toISOString());
  for (const { kind, target } of due) {
    if (stopping) return;
    try {
      const result = await checkTarget(kind, target);
      console.log(JSON.stringify({ level: "info", event: "watch_checked", kind, target, changed: result.changed, changes: result.changes.length }));
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "watch_failed", kind, target, message: error instanceof Error ? error.message : String(error) }));
    }
  }
}

async function loop() {
  console.log(JSON.stringify({ level: "info", event: "worker_started", intervalHours, pollMs }));
  while (!stopping) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
void loop();
