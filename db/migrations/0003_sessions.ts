import type { Knex } from "knex";

/**
 * Server-side sessions. The cookie carries a random token; the row id is its sha256,
 * so a database read never reveals a usable token.
 * Impersonation (spec §2.2) is a property of the session, not of the user.
 * */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sessions", (t) => {
    t.text("id").primary();
    t.uuid("user_id").notNullable().references("users.id").onDelete("CASCADE");
    t.uuid("impersonated_user_id").references("users.id").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("last_seen_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("revoked_at", { useTz: true });

    t.index(["user_id"]);
    t.index(["impersonated_user_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("sessions");
}
