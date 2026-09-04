import type { Knex } from "knex";

/**
 * Stored emails (spec §2.7). Lifecycle `state` and provider-side `delivery_status`
 * are independent columns. `lease_until` is the sender's claim (spec §4.1), so several
 * sender instances - and a human clicking Send - never deliver the same email twice.
 * */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("emails", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("collection_id").notNullable().references("collections.id").onDelete("CASCADE");
    t.text("from_address").notNullable();
    t.text("from_name");
    t.jsonb("to").notNullable().defaultTo("[]");
    t.jsonb("cc").notNullable().defaultTo("[]");
    t.jsonb("bcc").notNullable().defaultTo("[]");
    t.text("subject").notNullable().defaultTo("");
    t.text("text");
    t.text("html");
    t.text("state").notNullable().defaultTo("pending");
    t.text("delivery_status").notNullable().defaultTo("unknown");
    t.integer("attempts").notNullable().defaultTo(0);
    t.text("last_error");
    t.text("provider_message_id");
    t.text("source").notNullable().defaultTo("http");
    t.timestamp("lease_until", { useTz: true });
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("reviewed_at", { useTz: true });
    t.timestamp("sent_at", { useTz: true });

    t.check("text is not null or html is not null", [], "emails_body_present");
    t.check("state in ('pending', 'ready', 'sent')", [], "emails_state_check");
    t.check(
      "delivery_status in ('unknown', 'sent', 'delivered', 'bounced')",
      [],
      "emails_delivery_status_check",
    );
    t.check("source in ('http', 'smtp')", [], "emails_source_check");
    t.index(["collection_id", "state", "created_at"]);
    t.index(["provider_message_id"]);
  });

  // the sender's queue: ready emails, oldest first
  await knex.raw("create index emails_ready_queue on emails (created_at) where state = 'ready'");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("emails");
}
