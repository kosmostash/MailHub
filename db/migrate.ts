/**
 * Migration runner: `pnpm migrate` (latest), `pnpm migrate rollback`, `pnpm migrate status`,
 * `pnpm migrate make <name>`.
 * */
import knex from "knex";

import config from "../knexfile";

const [command = "latest", ...args] = process.argv.slice(2);

const instance = knex(config);

try {
  switch (command) {
    case "latest": {
      const [batch, migrations] = await instance.migrate.latest();
      console.log(
        migrations.length
          ? `Batch ${batch}: ran ${migrations.length} migration(s)\n  ${migrations.join("\n  ")}`
          : "Already up to date",
      );
      break;
    }
    case "rollback": {
      const [batch, migrations] = await instance.migrate.rollback();
      console.log(
        migrations.length
          ? `Batch ${batch}: rolled back ${migrations.length} migration(s)\n  ${migrations.join("\n  ")}`
          : "Nothing to roll back",
      );
      break;
    }
    case "status": {
      const [completed, pending] = await instance.migrate.list();
      console.log(`Completed: ${completed.length}\nPending: ${pending.length}`);
      for (const migration of pending) {
        console.log(`  ${typeof migration === "string" ? migration : migration.file}`);
      }
      break;
    }
    case "make": {
      const [name] = args;
      if (!name) {
        throw new Error("Usage: pnpm migrate make <name>");
      }
      console.log(await instance.migrate.make(name));
      break;
    }
    default:
      throw new Error(`Unknown command "${command}" (expected latest | rollback | status | make)`);
  }
} finally {
  await instance.destroy();
}
