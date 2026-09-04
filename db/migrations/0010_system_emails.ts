import type { Knex } from "knex";

/**
 * Ledger of every email MailHub sends on its own behalf (spec §2.1.8).
 * Never a stored email, never in a collection; this is what rate limiting reads.
 * */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("system_emails", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("recipient").notNullable();
    t.text("purpose").notNullable();
    t.uuid("user_id").references("users.id").onDelete("SET NULL");
    t.text("status").notNullable();
    t.text("error");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.check("status in ('sent', 'failed')", [], "system_emails_status_check");
    t.index(["recipient", "created_at"]);
    t.index(["user_id", "purpose", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("system_emails");
}
