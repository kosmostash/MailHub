/**
 * Background sender (spec §4.1). Runs as its own process: `pnpm sender`.
 *
 * Phase 0: connects, verifies the database, and idles until stopped.
 * The drain loop (claim ready emails with a lease, send through the collection's
 * provider, record the outcome) lands in Phase 4.
 * */
import { closeDb, pingDb } from "@/domain/db";
import { env } from "@/domain/env";

const log = (message: string) => console.log(`[sender] ${message}`);

let running = true;

const shutdown = async (signal: string) => {
  log(`received ${signal}, stopping`);
  running = false;
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await pingDb();
log(
  `connected; polling every ${env.senderIntervalMs}ms, batches of ${env.senderBatchSize}, max ${env.senderMaxAttempts} attempts`,
);

while (running) {
  // TODO(phase 4): drain ready emails
  await new Promise((resolve) => setTimeout(resolve, env.senderIntervalMs));
}

await closeDb();
log("stopped");
