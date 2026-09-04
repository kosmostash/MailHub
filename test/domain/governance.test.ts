import { beforeEach, describe, expect, it } from "vitest";

import { truncateAll } from "../setup";

import { createSuperadmin } from "@/domain/accounts/bootstrap";
import {
  deleteManagedUser,
  disableManagedUser,
  enableManagedUser,
  reassignManagedUser,
} from "@/domain/accounts/governance";
import { createTestAddress } from "@/domain/accounts/test-addresses";
import type { Actor } from "@/domain/accounts/types";
import { createManagedUser, findUserById } from "@/domain/accounts/users";
import { listActivity } from "@/domain/activity";
import { listActivityFor } from "@/domain/activity/views";
import { createCollection, getCollection, listCollections } from "@/domain/collections";
import { db } from "@/domain/db";
import { resolveSubmissionTarget } from "@/domain/emails";
import { createProvider, listProviders } from "@/domain/providers";
import { resolveSession, signIn } from "@/domain/sessions";

const password = "correct horse battery";
const smtp = { host: "127.0.0.1", port: 2525, secure: false };

const setup = async () => {
  const root: Actor = { user: await createSuperadmin({ email: "root@example.test", password }) };
  const a1 = await createManagedUser(root, { email: "one@example.test", password });
  const a2 = await createManagedUser(root, { email: "two@example.test", password });
  const adminOne: Actor = { user: (await findUserById(a1.id))! };
  const adminTwo: Actor = { user: (await findUserById(a2.id))! };
  const o1 = await createManagedUser(adminOne, { email: "o1@example.test", password });
  const o2 = await createManagedUser(adminOne, { email: "o2@example.test", password });
  const opOne: Actor = { user: (await findUserById(o1.id))! };
  const opTwo: Actor = { user: (await findUserById(o2.id))! };
  const reload = async (a: Actor): Promise<Actor> => ({ user: (await findUserById(a.user.id))! });
  return { root, adminOne, adminTwo, opOne, opTwo, reload };
};

beforeEach(async () => {
  await truncateAll();
});

describe("disable and re-enable", () => {
  it("revokes the scope's sessions, blocks sign-in and submissions, and does not stack", async () => {
    const { root, adminOne, opOne, opTwo } = await setup();
    const a = await createCollection(opOne, { name: "A" });
    const adminSession = await signIn({ email: "one@example.test", password });
    const opSession = await signIn({ email: "o1@example.test", password });
    const otherOp = await signIn({ email: "o2@example.test", password });

    // an admin disables their operator: only that operator's session dies
    await disableManagedUser(adminOne, opOne.user.id);
    expect(await resolveSession(opSession.token)).toBeUndefined();
    expect(await resolveSession(otherOp.token)).toBeDefined();
    await expect(signIn({ email: "o1@example.test", password })).rejects.toMatchObject({ code: "account_disabled" });
    expect((await resolveSubmissionTarget(a.id)).status).toBe("operator_disabled");

    // the superadmin disables the admin: the admin and every operator under them
    await disableManagedUser(root, adminOne.user.id);
    expect(await resolveSession(adminSession.token)).toBeUndefined();
    expect(await resolveSession(otherOp.token)).toBeUndefined();
    await expect(signIn({ email: "o2@example.test", password })).rejects.toMatchObject({ code: "account_disabled" });
    expect((await resolveSubmissionTarget(a.id)).status).toBe("admin_disabled");

    // re-enabling the admin does not re-enable the individually disabled operator
    await enableManagedUser(root, adminOne.user.id);
    expect((await signIn({ email: "o2@example.test", password })).user.email).toBe("o2@example.test");
    await expect(signIn({ email: "o1@example.test", password })).rejects.toMatchObject({ code: "account_disabled" });
    expect((await resolveSubmissionTarget(a.id)).status).toBe("operator_disabled");
    await enableManagedUser(adminOne, opOne.user.id);
    expect((await resolveSubmissionTarget(a.id)).status).toBe("ok");
    expect(opTwo.user.disabled_at).toBeNull();

    const trail = await listActivity({});
    expect(trail.entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(["operator.disabled", "admin.disabled", "admin.enabled", "operator.enabled"]),
    );
    const adminDisabled = trail.entries.find((e) => e.action === "admin.disabled");
    expect(adminDisabled?.actor.role).toBe("superadmin");
    expect(adminDisabled?.details).toMatchObject({ sessionsRevoked: 2 });
  });

  it("is one level down only", async () => {
    const { root, adminOne, adminTwo, opOne } = await setup();
    await expect(disableManagedUser(root, opOne.user.id)).rejects.toMatchObject({ status: 404 });
    await expect(disableManagedUser(adminTwo, opOne.user.id)).rejects.toMatchObject({ status: 404 });
    await expect(disableManagedUser(adminOne, adminTwo.user.id)).rejects.toMatchObject({ status: 404 });
    await expect(disableManagedUser(opOne, adminOne.user.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe("reassignment and deletion", () => {
  it("moves a disabled operator's collections, ids intact, then allows deletion", async () => {
    const { adminOne, opOne, opTwo, reload } = await setup();
    const provider = await createProvider(adminOne, { name: "P", type: "smtp", config: smtp });
    const a = await createCollection(opOne, { name: "A", providerId: provider.id });
    const clash = await createCollection(opOne, { name: "Shared" });
    await createCollection(opTwo, { name: "Shared" });
    await createTestAddress(opOne, { address: "me@example.test" });

    await expect(deleteManagedUser(adminOne, opOne.user.id)).rejects.toMatchObject({ status: 409, code: "not_disabled" });
    await expect(reassignManagedUser(adminOne, opOne.user.id, opTwo.user.id)).rejects.toMatchObject({ code: "source_not_disabled" });

    await disableManagedUser(adminOne, opOne.user.id);
    await expect(deleteManagedUser(adminOne, opOne.user.id)).rejects.toMatchObject({ status: 409, code: "not_empty" });
    await expect(reassignManagedUser(adminOne, opOne.user.id, opOne.user.id)).rejects.toMatchObject({ code: "same_account" });

    const summary = await reassignManagedUser(adminOne, opOne.user.id, opTwo.user.id);
    expect(summary).toMatchObject({ collections: 2, to: { email: "o2@example.test" } });

    const moved = await getCollection(await reload(opTwo), a.id);
    expect(moved.id).toBe(a.id);
    expect(moved.operator.email).toBe("o2@example.test");
    expect(moved.provider?.id).toBe(provider.id);
    expect((await listCollections(await reload(opTwo))).map((c) => c.name).sort()).toEqual(["A", "Shared", "Shared (from o1@example.test)"]);
    expect((await getCollection(await reload(opTwo), clash.id)).name).toBe("Shared (from o1@example.test)");
    expect((await resolveSubmissionTarget(a.id)).status).toBe("ok");

    await deleteManagedUser(adminOne, opOne.user.id);
    expect(await findUserById(opOne.user.id)).toBeUndefined();
    expect(await db()("test_addresses").where({ user_id: opOne.user.id })).toEqual([]);
    const trail = await listActivity({ adminId: adminOne.user.id });
    const deleted = trail.entries.find((e) => e.action === "operator.deleted");
    expect(deleted?.details).toMatchObject({ email: "o1@example.test" });
    const created = trail.entries.find((e) => e.action === "collection.created" && e.objectId === a.id);
    expect(created?.actor.email).toBe("o1@example.test");
  });

  it("moves a disabled admin's operators and providers together, suffixing name clashes", async () => {
    const { root, adminOne, adminTwo, opOne, reload } = await setup();
    const p = await createProvider(adminOne, { name: "Main", type: "smtp", config: smtp });
    await createProvider(adminTwo, { name: "Main", type: "smtp", config: smtp });
    const a = await createCollection(opOne, { name: "A", providerId: p.id });

    await disableManagedUser(root, adminOne.user.id);
    await expect(deleteManagedUser(root, adminOne.user.id)).rejects.toMatchObject({ code: "not_empty" });
    await expect(reassignManagedUser(root, adminOne.user.id, adminTwo.user.id)).resolves.toMatchObject({
      operators: 2,
      providers: 1,
      renamedProviders: [{ from: "Main", to: "Main (from one@example.test)" }],
    });

    expect((await listProviders(await reload(adminTwo))).map((x) => x.name).sort()).toEqual(["Main", "Main (from one@example.test)"]);
    const op = await reload(opOne);
    expect(op.user.admin_id).toBe(adminTwo.user.id);
    const col = await getCollection(await reload(adminTwo), a.id);
    expect(col.provider?.id).toBe(p.id);
    // the operator was not individually disabled: under an active admin, mail resumes
    expect((await resolveSubmissionTarget(a.id)).status).toBe("ok");

    await deleteManagedUser(root, adminOne.user.id);
    expect(await findUserById(adminOne.user.id)).toBeUndefined();
    // a populated admin cannot be deleted
    await disableManagedUser(root, adminTwo.user.id);
    await expect(deleteManagedUser(root, adminTwo.user.id)).rejects.toMatchObject({ code: "not_empty" });
  });

  it("requires an active target of the same kind under the same overseer", async () => {
    const { root, adminOne, adminTwo, opOne, opTwo } = await setup();
    const other = await createManagedUser(adminTwo, { email: "o3@example.test", password });
    await disableManagedUser(adminOne, opOne.user.id);
    await disableManagedUser(adminOne, opTwo.user.id);
    await expect(reassignManagedUser(adminOne, opOne.user.id, opTwo.user.id)).rejects.toMatchObject({ code: "target_disabled" });
    await expect(reassignManagedUser(adminOne, opOne.user.id, other.id)).rejects.toMatchObject({ status: 404 });
    await expect(reassignManagedUser(root, opOne.user.id, other.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("activity views", () => {
  it("scopes the trail by role", async () => {
    const { root, adminOne, adminTwo, opOne } = await setup();
    await createCollection(opOne, { name: "A" });
    const o3 = await createManagedUser(adminTwo, { email: "o3@example.test", password });
    await createCollection({ user: (await findUserById(o3.id))! }, { name: "C" });

    const all = await listActivityFor(root, {});
    expect(all.entries.length).toBeGreaterThan(5);
    const one = await listActivityFor(adminOne, {});
    expect(one.entries.every((e) => e.actor.email !== "o3@example.test")).toBe(true);
    expect(one.entries.some((e) => e.action === "collection.created")).toBe(true);
    expect(one.entries.some((e) => e.action === "operator.created")).toBe(true);
    const mine = await listActivityFor(opOne, {});
    expect(mine.entries.map((e) => e.action)).toEqual(["collection.created", "operator.created"]);
    await expect(listActivityFor(opOne, { operatorId: o3.id })).rejects.toMatchObject({ status: 403 });
    await expect(listActivityFor(adminOne, { operatorId: o3.id })).rejects.toMatchObject({ status: 404 });
    const filtered = await listActivityFor(root, { adminId: adminTwo.user.id });
    expect(filtered.entries.every((e) => e.actor.email !== "o1@example.test")).toBe(true);
  });
});
