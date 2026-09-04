import { beforeEach, describe, expect, it } from "vitest";

import { truncateAll } from "../setup";

import { createSuperadmin } from "@/domain/accounts/bootstrap";
import type { Actor } from "@/domain/accounts/types";
import { createManagedUser, findUserById } from "@/domain/accounts/users";
import {
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  updateCollection,
} from "@/domain/collections";
import { db } from "@/domain/db";
import {
  createProvider,
  decryptedConfig,
  deleteProvider,
  getProvider,
  listProviders,
  type ProviderRow,
  SECRET_MASK,
  updateProvider,
} from "@/domain/providers";
import { ProviderNotImplementedError, sendViaProviderType } from "@/domain/providers/registry";
import { decryptSecret, encryptSecret, isEncrypted } from "@/domain/providers/secrets";

const password = "correct horse battery";
const smtpConfig = { host: "smtp.example.test", port: 587, secure: false, user: "u", pass: "hunter2" };

const setup = async () => {
  const rootRow = await createSuperadmin({ email: "root@example.test", password });
  const root: Actor = { user: rootRow };
  const a1 = await createManagedUser(root, { email: "one@example.test", password });
  const a2 = await createManagedUser(root, { email: "two@example.test", password });
  const adminOne: Actor = { user: (await findUserById(a1.id))! };
  const adminTwo: Actor = { user: (await findUserById(a2.id))! };
  const o1 = await createManagedUser(adminOne, { email: "o1@example.test", password });
  const o1b = await createManagedUser(adminOne, { email: "o1b@example.test", password });
  const o2 = await createManagedUser(adminTwo, { email: "o2@example.test", password });
  const opOne: Actor = { user: (await findUserById(o1.id))! };
  const opOneB: Actor = { user: (await findUserById(o1b.id))! };
  const opTwo: Actor = { user: (await findUserById(o2.id))! };
  return { root, adminOne, adminTwo, opOne, opOneB, opTwo };
};

beforeEach(async () => {
  await truncateAll();
});

describe("secrets", () => {
  it("round-trips and marks encrypted values", () => {
    const enc = encryptSecret("hunter2");
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain("hunter2");
    expect(decryptSecret(enc)).toBe("hunter2");
    expect(decryptSecret("plain")).toBe("plain");
  });
});

describe("providers", () => {
  it("are created by admins only, validated per type, stored encrypted, returned masked", async () => {
    const { adminOne, opOne, root } = await setup();
    await expect(createProvider(opOne, { name: "x", type: "smtp", config: smtpConfig })).rejects.toMatchObject({ status: 403 });
    await expect(createProvider(root, { name: "x", type: "smtp", config: smtpConfig })).rejects.toMatchObject({ status: 403 });
    await expect(createProvider(adminOne, { name: "x", type: "smtp", config: { host: "" } })).rejects.toMatchObject({
      status: 422,
      details: expect.arrayContaining([expect.objectContaining({ field: "host" })]),
    });
    await expect(createProvider(adminOne, { name: "x", type: "carrier-pigeon", config: {} })).rejects.toMatchObject({ status: 422 });

    const view = await createProvider(adminOne, { name: "Main", type: "smtp", config: smtpConfig });
    expect(view.config).toMatchObject({ host: "smtp.example.test", port: 587, user: "u", pass: SECRET_MASK });

    const row = (await db()<ProviderRow>("providers").where({ id: view.id }).first())!;
    expect(isEncrypted(row.config.pass)).toBe(true);
    expect(decryptedConfig(row).pass).toBe("hunter2");

    await expect(createProvider(adminOne, { name: "Main", type: "smtp", config: smtpConfig })).rejects.toMatchObject({
      status: 409,
      code: "name_taken",
    });
  });

  it("keeps the stored secret when the mask is sent back, replaces it otherwise", async () => {
    const { adminOne } = await setup();
    const view = await createProvider(adminOne, { name: "Main", type: "smtp", config: smtpConfig });
    await updateProvider(adminOne, view.id, { config: { ...smtpConfig, pass: SECRET_MASK, port: 2525 } });
    let row = (await db()<ProviderRow>("providers").where({ id: view.id }).first())!;
    expect(decryptedConfig(row)).toMatchObject({ port: 2525, pass: "hunter2" });

    await updateProvider(adminOne, view.id, { name: "Renamed", config: { ...smtpConfig, pass: "changed" } });
    row = (await db()<ProviderRow>("providers").where({ id: view.id }).first())!;
    expect(row.name).toBe("Renamed");
    expect(decryptedConfig(row).pass).toBe("changed");
  });

  it("scopes visibility: operators see name and type of their admin's, admins their own, superadmin all", async () => {
    const { adminOne, adminTwo, opOne, opTwo, root } = await setup();
    const p1 = await createProvider(adminOne, { name: "One", type: "smtp", config: smtpConfig });
    await createProvider(adminTwo, { name: "Two", type: "smtp", config: smtpConfig });

    expect((await listProviders(adminOne)).map((p) => p.name)).toEqual(["One"]);
    expect((await listProviders(adminTwo)).map((p) => p.name)).toEqual(["Two"]);
    expect((await listProviders(root)).map((p) => p.name)).toEqual(["One", "Two"]);

    const forOperator = await listProviders(opOne);
    expect(forOperator).toHaveLength(1);
    expect(forOperator[0]).toMatchObject({ name: "One", type: "smtp", config: null });
    expect((await listProviders(opTwo)).map((p) => p.name)).toEqual(["Two"]);

    await expect(getProvider(adminTwo, p1.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateProvider(adminTwo, p1.id, { name: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteProvider(adminTwo, p1.id)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses deletion while assigned to a collection", async () => {
    const { adminOne, opOne } = await setup();
    const p = await createProvider(adminOne, { name: "One", type: "smtp", config: smtpConfig });
    const c = await createCollection(opOne, { name: "A", providerId: p.id });
    await expect(deleteProvider(adminOne, p.id)).rejects.toMatchObject({ status: 409, code: "provider_in_use" });
    await updateCollection(opOne, c.id, { providerId: null });
    await deleteProvider(adminOne, p.id);
    expect(await listProviders(adminOne)).toEqual([]);
  });

  it("fails loudly for an unimplemented type", async () => {
    await expect(
      sendViaProviderType("nope", {}, { from: { address: "a@b.c" }, to: [], cc: [], bcc: [], subject: "" }),
    ).rejects.toBeInstanceOf(ProviderNotImplementedError);
  });
});

describe("collections", () => {
  it("belong to operators, with per-owner unique names and unguessable ids", async () => {
    const { adminOne, opOne, opOneB } = await setup();
    await expect(createCollection(adminOne, { name: "A" })).rejects.toMatchObject({ status: 403 });

    const a = await createCollection(opOne, { name: "A" });
    expect(a.id).toHaveLength(32);
    expect(a.scheduleMode).toBe("after_review");
    expect(a.provider).toBeNull();
    await expect(createCollection(opOne, { name: "A" })).rejects.toMatchObject({ status: 409 });
    // same name under another operator is fine
    const b = await createCollection(opOneB, { name: "A", scheduleMode: "immediate" });
    expect(b.scheduleMode).toBe("immediate");
  });

  it("only assigns the operator's admin's providers", async () => {
    const { adminOne, adminTwo, opOne } = await setup();
    const mine = await createProvider(adminOne, { name: "One", type: "smtp", config: smtpConfig });
    const theirs = await createProvider(adminTwo, { name: "Two", type: "smtp", config: smtpConfig });
    await expect(createCollection(opOne, { name: "A", providerId: theirs.id })).rejects.toMatchObject({ status: 422 });
    const a = await createCollection(opOne, { name: "A", providerId: mine.id });
    expect(a.provider).toMatchObject({ id: mine.id, name: "One" });
    await expect(updateCollection(opOne, a.id, { providerId: theirs.id })).rejects.toMatchObject({ status: 422 });
  });

  it("is scoped absolutely, read-only above the operator", async () => {
    const { root, adminOne, adminTwo, opOne, opOneB, opTwo } = await setup();
    const a = await createCollection(opOne, { name: "A" });
    await createCollection(opOneB, { name: "B" });
    await createCollection(opTwo, { name: "C" });

    expect((await listCollections(opOne)).map((c) => c.name)).toEqual(["A"]);
    expect((await listCollections(adminOne)).map((c) => c.name)).toEqual(["A", "B"]);
    expect((await listCollections(adminTwo)).map((c) => c.name)).toEqual(["C"]);
    expect((await listCollections(root)).map((c) => c.name)).toEqual(["A", "B", "C"]);
    expect((await listCollections(root, { adminId: adminTwo.user.id })).map((c) => c.name)).toEqual(["C"]);

    // sibling operator and other admin: 404
    await expect(getCollection(opOneB, a.id)).rejects.toMatchObject({ status: 404 });
    await expect(getCollection(adminTwo, a.id)).rejects.toMatchObject({ status: 404 });
    // admin reads, but cannot write in own identity
    expect((await getCollection(adminOne, a.id)).name).toBe("A");
    await expect(updateCollection(adminOne, a.id, { name: "Z" })).rejects.toMatchObject({ status: 403 });
    await expect(deleteCollection(adminOne, a.id)).rejects.toMatchObject({ status: 403 });
    // impersonation carries the operator's powers
    const asOperator: Actor = { user: opOne.user, via: adminOne.user };
    expect((await updateCollection(asOperator, a.id, { name: "Z" })).name).toBe("Z");
  });

  it("keeps its id across edits and deletes with its emails", async () => {
    const { opOne } = await setup();
    const a = await createCollection(opOne, { name: "A" });
    await db()("emails").insert({
      collection_id: a.id,
      from_address: "x@example.test",
      to: JSON.stringify([{ address: "y@example.test" }]),
      subject: "s",
      text: "t",
    });
    const updated = await updateCollection(opOne, a.id, { scheduleMode: "immediate" });
    expect(updated.id).toBe(a.id);
    expect(updated.counters).toMatchObject({ total: 1, pending: 1 });
    await deleteCollection(opOne, a.id);
    expect(await db()("emails").where({ collection_id: a.id }).count("* as n").first()).toMatchObject({ n: "0" });
    await expect(getCollection(opOne, a.id)).rejects.toMatchObject({ status: 404 });
  });
});
