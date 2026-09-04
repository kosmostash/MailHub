/**
 * SMTP ingestion listener (spec §3.6). Runs as its own process: `pnpm smtp`.
 *
 * Phase 0: connects, verifies the database, and idles until stopped.
 * The listener itself (AUTH with the collection id, parse, store, 250) lands in Phase 3.
 * */
import { closeDb, pingDb } from "@/domain/db";
import { env } from "@/domain/env";

const log = (message: string) => console.log(`[smtp] ${message}`);

await pingDb();
log(`connected; listener will bind ${env.smtpHost}:${env.smtpPort} (not implemented yet)`);

await new Promise<void>((resolve) => {
  process.once("SIGINT", () => resolve());
  process.once("SIGTERM", () => resolve());
});

await closeDb();
log("stopped");
