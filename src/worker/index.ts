import { envNumber } from "@/lib/env";
import { runDueChecks } from "@/lib/service";

/** Re-reads every watched target once per interval and notifies watchers of changes (for hosts that run a worker). */
const intervalHours = Math.max(0.05, envNumber("WATCH_INTERVAL_HOURS", 24));
const pollMs = Math.max(10_000, envNumber("WATCH_POLL_SECONDS", 300) * 1000);
let stopping = false;

async function loop() {
  console.log(JSON.stringify({ level: "info", event: "worker_started", intervalHours, pollMs }));
  while (!stopping) {
    await runDueChecks({ intervalHours, budgetMs: pollMs, log: (entry) => console.log(JSON.stringify(entry)) }).catch((error) => console.error(JSON.stringify({ level: "error", event: "worker_tick_failed", message: String(error) })));
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
void loop();
