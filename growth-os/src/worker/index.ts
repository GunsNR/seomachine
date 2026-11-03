/**
 * Background worker: claims due jobs with a lease and runs them.
 * Run with `npm run worker`. Safe to run several copies — claims use
 * FOR UPDATE SKIP LOCKED, and handlers are idempotent.
 */
import { runDueJobs } from "../lib/jobs/queue";
import { handlers } from "../lib/jobs/handlers";
import { systemDb } from "../lib/db";
import { redact } from "../lib/crypto";

const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 6)}`;
let stopping = false;

async function loop() {
  console.log(`[worker] ${workerId} started`);
  while (!stopping) {
    try {
      const n = await runDueJobs(handlers, { workerId, max: 25 });
      if (n) console.log(`[worker] ran ${n} job(s)`);
    } catch (e) {
      console.error("[worker] loop error:", redact(e instanceof Error ? e.message : String(e)));
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  await systemDb.$disconnect();
  console.log("[worker] stopped");
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopping = true; });
loop();
