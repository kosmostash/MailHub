import { describe, expect, it } from "vitest";

import { db, pingDb } from "@/domain/db";

describe("database schema", () => {
  it("answers a liveness ping", async () => {
    await expect(pingDb()).resolves.toBe(true);
  });

  it("has every table the domain expects", async () => {
    const rows = await db()
      .select<{ table_name: string }[]>("table_name")
      .from("information_schema.tables")
      .where({ table_schema: "public" });
    const names = rows.map((row) => row.table_name).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        "activity",
        "collections",
        "confirmation_codes",
        "emails",
        "providers",
        "sessions",
        "system_emails",
        "test_addresses",
        "users",
      ]),
    );
  });

  it("allows at most one superadmin", async () => {
    await db()
      .insert({ role: "superadmin", email: "root@example.test", password_hash: "x" })
      .into("users");
    await expect(
      db()
        .insert({ role: "superadmin", email: "second@example.test", password_hash: "x" })
        .into("users"),
    ).rejects.toThrow(/users_single_superadmin/);
  });

  it("requires operators to have an admin and forbids it for other roles", async () => {
    await expect(
      db().insert({ role: "operator", email: "op@example.test", password_hash: "x" }).into("users"),
    ).rejects.toThrow(/users_operator_has_admin/);

    const [admin] = await db()
      .insert({ role: "admin", email: "admin@example.test", password_hash: "x" })
      .into("users")
      .returning<{ id: string }[]>("id");

    await expect(
      db()
        .insert({ role: "admin", email: "admin2@example.test", password_hash: "x", admin_id: admin!.id })
        .into("users"),
    ).rejects.toThrow(/users_operator_has_admin/);

    await expect(
      db()
        .insert({ role: "operator", email: "op@example.test", password_hash: "x", admin_id: admin!.id })
        .into("users"),
    ).resolves.toBeDefined();
  });

  it("treats emails case-insensitively", async () => {
    await db()
      .insert({ role: "admin", email: "Case@Example.test", password_hash: "x" })
      .into("users");
    await expect(
      db().insert({ role: "admin", email: "case@example.TEST", password_hash: "x" }).into("users"),
    ).rejects.toThrow(/users_email_unique/);
  });

  it("rejects an email with neither text nor html", async () => {
    const [admin] = await db()
      .insert({ role: "admin", email: "a@example.test", password_hash: "x" })
      .into("users")
      .returning<{ id: string }[]>("id");
    const [operator] = await db()
      .insert({ role: "operator", email: "o@example.test", password_hash: "x", admin_id: admin!.id })
      .into("users")
      .returning<{ id: string }[]>("id");
    await db().insert({ id: "c".repeat(32), operator_id: operator!.id, name: "A" }).into("collections");

    await expect(
      db()
        .insert({
          collection_id: "c".repeat(32),
          from_address: "from@example.test",
          to: JSON.stringify([{ address: "to@example.test" }]),
          subject: "no body",
        })
        .into("emails"),
    ).rejects.toThrow(/emails_body_present/);
  });
});
