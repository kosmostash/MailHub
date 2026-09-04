import type { Knex } from "knex";

/**
 * One table for all three roles (spec §2.1, implementation note).
 * - email is unique across roles
 * - at most one row may have role = 'superadmin' (partial unique index)
 * - operators have an admin, other roles do not
 * */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("role").notNullable();
    t.uuid("admin_id").references("users.id").onDelete("RESTRICT");
    t.specificType("email", "citext").notNullable().unique();
    t.text("password_hash").notNullable();
    t.timestamp("disabled_at", { useTz: true });
    t.text("totp_secret");
    t.timestamp("totp_enabled_at", { useTz: true });
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.check("role in ('superadmin', 'admin', 'operator')", [], "users_role_check");
    t.check("(role = 'operator') = (admin_id is not null)", [], "users_operator_has_admin");
    t.index(["admin_id"]);
  });

  await knex.raw(
    "create unique index users_single_superadmin on users ((true)) where role = 'superadmin'",
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("users");
}
