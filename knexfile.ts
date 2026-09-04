import type { Knex } from "knex";

import { env } from "./domain/env";

/**
 * Shared by `db/migrate.ts` (the migration runner) and by test setup.
 * Migrations are TypeScript and run through tsx, in every environment.
 * */
const config: Knex.Config = {
  client: "pg",
  connection: env.databaseUrl,
  pool: { min: 0, max: 5 },
  migrations: {
    directory: "./db/migrations",
    extension: "ts",
    loadExtensions: [".ts"],
    tableName: "knex_migrations",
  },
};

export default config;
