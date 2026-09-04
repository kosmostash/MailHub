import type { Knex } from "knex";

/**
 * One-time codes gating self-service credential changes (spec §2.1.7).
 * `payload` holds what the confirmation applies: the new email, or the new password hash.
 * */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("confirmation_codes", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("user_id").notNullable().references("users.id").onDelete("CASCADE");
    t.text("purpose").notNullable();
    t.text("code_hash").notNullable();
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.text("sent_to").notNullable();
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("consumed_at", { useTz: true });
    t.integer("attempts").notNullable().defaultTo(0);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.check(
      "purpose in ('email_change', 'password_change')",
      [],
      "confirmation_codes_purpose_check",
    );
    t.index(["user_id", "purpose", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("confirmation_codes");
}
