/**
 * Background sender (spec §4.1). Runs as its own process: `pnpm sender`.
 * Every interval, claims a batch of ready emails (leased, oldest first, provider assigned,
 * owner enabled, under the attempt cap) and hands them to their providers. Several
 * instances may run side by side; the lease and SKIP LOCKED keep them apart.
 * On SIGTERM the email at hand finishes, nothing further is picked up (spec §6).
 * */
import { closeDb, pingDb } from "@/domain/db";
import { env } from "@/domain/env";
import { runSenderBatch } from "@/domain/sending";

const log = (message: string) => console.log(`[sender] ${message}`);

let running = true;
let wake: (() => void) | undefined;

const shutdown = (signal: string) => {
  log(`received ${signal}, finishing the current batch`);
  running = false;
  wake?.();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await pingDb();
log(
  `connected; polling every ${env.senderIntervalMs}ms, batches of ${env.senderBatchSize}, max ${env.senderMaxAttempts} attempts`,
);

while (running) {
  try {
    const { claimed, sent, failed } = await runSenderBatch();
    if (claimed) {
      log(`batch: ${sent} sent, ${failed} failed`);
    }
    if (claimed === env.senderBatchSize) {
      // more may be waiting: go again without sleeping
      continue;
    }
  } catch (error) {
    log(`batch error: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (running) {
    await new Promise<void>((resolve) => {
      wake = resolve;
      setTimeout(resolve, env.senderIntervalMs);
    });
    wake = undefined;
  }
}

await closeDb();
log("stopped");
