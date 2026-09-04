/**
 * Runs in every test worker before the test file: same environment as global-setup,
 * plus a clean slate - every table emptied - before each test file.
 * */
import { afterAll, beforeAll } from "vitest";

process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/mailhub_test";
process.env.NODE_ENV = "test";
process.env.MAILHUB_SECRET ??= "test-secret-test-secret-test-secret-0";

const { closeDb, db } = await import("@/domain/db");

export const truncateAll = async (): Promise<void> => {
  await db().raw(
    `truncate table
       activity, system_emails, confirmation_codes, test_addresses, emails,
       collections, providers, sessions, users
     restart identity cascade`,
  );
};

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});
