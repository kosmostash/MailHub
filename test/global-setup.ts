/**
 * Runs once per `vitest` invocation: points DATABASE_URL at the test database
 * and brings its schema up to date. Test files then start from migrated, empty tables.
 * */
import knex from "knex";

export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/mailhub_test";

export default async function setup(): Promise<void> {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.NODE_ENV = "test";
  process.env.MAILHUB_SECRET ??= "test-secret-test-secret-test-secret-0";

  const { default: config } = await import("../knexfile");
  const instance = knex(config);
  try {
    await instance.migrate.latest();
  } finally {
    await instance.destroy();
  }
}
