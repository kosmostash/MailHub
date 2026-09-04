import type { Knex } from "knex";

/** Delivery providers, owned by an admin (spec §2.4). Secrets inside config are encrypted at rest. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("providers", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("admin_id").notNullable().references("users.id").onDelete("RESTRICT");
    t.text("name").notNullable();
    t.text("type").notNullable();
    t.jsonb("config").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(["admin_id", "name"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("providers");
}
