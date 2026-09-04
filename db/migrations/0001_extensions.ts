import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // case-insensitive emails; gen_random_uuid() is built into Postgres 13+
  await knex.raw("create extension if not exists citext");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("drop extension if exists citext");
}
