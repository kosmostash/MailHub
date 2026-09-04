/**
 * SMTP ingestion listener (spec §3.6). Runs as its own process: `pnpm smtp`.
 * Accepts mail authenticated with a collection id, stores it, never relays.
 * */
import { closeDb, pingDb } from "@/domain/db";
import { env } from "@/domain/env";
import { createSmtpListener } from "@/domain/ingest/smtp";

const log = (message: string) => console.log(`[smtp] ${message}`);

await pingDb();

const listener = createSmtpListener({
  host: env.smtpHost,
  port: env.smtpPort,
  maxMessageBytes: env.smtpMaxMessageBytes,
  log,
});

const port = await listener.start();
log(`listening on ${env.smtpHost}:${port}; the collection id is the SMTP password`);

await new Promise<void>((resolve) => {
  process.once("SIGINT", () => resolve());
  process.once("SIGTERM", () => resolve());
});

log("stopping");
await listener.stop();
await closeDb();
log("stopped");
