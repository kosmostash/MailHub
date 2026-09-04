import type { Knex } from "knex";

/** Operator-owned "send to me" targets (spec §2.5); deleted with the account (spec §2.1.6). */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("test_addresses", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("user_id").notNullable().references("users.id").onDelete("CASCADE");
    t.text("address").notNullable();
    t.text("label");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["user_id", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("test_addresses");
}
