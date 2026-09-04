import knex, { type Knex } from "knex";

import { env } from "./env";

let instance: Knex | undefined;

/**
 * Lazily created, process-wide Knex instance.
 * Lazy so importing the domain layer never opens a connection by itself
 * (route modules, tests and workers all share this file).
 * */
export const db = (): Knex => {
  instance ??= knex({
    client: "pg",
    connection: env.databaseUrl,
    pool: { min: 0, max: 10 },
  });
  return instance;
};

export const closeDb = async (): Promise<void> => {
  if (instance) {
    const current = instance;
    instance = undefined;
    await current.destroy();
  }
};

export const withTransaction = <T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> => {
  return db().transaction(fn);
};

/** Liveness check used by /api/health */
export const pingDb = async (): Promise<boolean> => {
  await db().raw("select 1");
  return true;
};
