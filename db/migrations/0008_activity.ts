import type { Knex } from "knex";

/**
 * The activity trail (spec §2.6). Append-only.
 * Actor columns are snapshots (email, role) next to nullable FKs, so deleting an account
 * keeps its history intact and still naming it. Scope columns index "this admin's trail"
 * and "this operator's trail" directly.
 * */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("activity", (t) => {
    t.bigIncrements("id").primary();
    t.timestamp("at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.text("action").notNullable();
    t.text("object_type").notNullable();
    t.text("object_id");
    t.uuid("actor_id").references("users.id").onDelete("SET NULL");
    t.text("actor_email");
    t.text("actor_role").notNullable();
    t.uuid("via_id").references("users.id").onDelete("SET NULL");
    t.text("via_email");
    t.uuid("admin_scope_id");
    t.uuid("operator_scope_id");
    t.jsonb("details").notNullable().defaultTo("{}");

    t.check(
      "actor_role in ('system', 'superadmin', 'admin', 'operator')",
      [],
      "activity_actor_role_check",
    );
    t.index(["admin_scope_id", "id"]);
    t.index(["operator_scope_id", "id"]);
    t.index(["actor_id", "id"]);
    t.index(["at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("activity");
}
