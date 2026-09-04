import { beforeEach, describe, expect, it } from "vitest";

import { truncateAll } from "../setup";

import { createSuperadmin, superadminExists } from "@/domain/accounts/bootstrap";
import { createManagedUser, findUserById, resetManagedPassword } from "@/domain/accounts/users";
import { listActivity } from "@/domain/activity";
import { db } from "@/domain/db";
import { DomainError } from "@/domain/errors";
import {
  canImpersonate,
  resolveSession,
  revokeSession,
  signIn,
  startImpersonation,
  stopImpersonation,
} from "@/domain/sessions";

const password = "correct horse battery";

beforeEach(async () => {
  await truncateAll();
});

describe("bootstrap", () => {
  it("creates the superadmin exactly once", async () => {
    expect(await superadminExists()).toBe(false);
    const root = await createSuperadmin({ email: "root@example.test", password });
    expect(root.role).toBe("superadmin");
    expect(await superadminExists()).toBe(true);

    await expect(createSuperadmin({ email: "root2@example.test", password })).rejects.toMatchObject({
      status: 409,
      code: "superadmin_exists",
    });
  });

  it("refuses short passwords", async () => {
    await expect(createSuperadmin({ email: "x@example.test", password: "short" })).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe("sessions and impersonation", () => {
  const setup = async () => {
    const root = await createSuperadmin({ email: "root@example.test", password });
    const adminOne = await createManagedUser({ user: root }, { email: "one@example.test", password });
    const adminTwo = await createManagedUser({ user: root }, { email: "two@example.test", password });
    const adminOneRow = (await findUserById(adminOne.id))!;
    const adminTwoRow = (await findUserById(adminTwo.id))!;
    const opOne = await createManagedUser({ user: adminOneRow }, { email: "o1@example.test", password });
    const opTwo = await createManagedUser({ user: adminTwoRow }, { email: "o2@example.test", password });
    return { root, adminOneRow, adminTwoRow, opOne, opTwo };
  };

  it("signs in, resolves and revokes", async () => {
    await setup();
    await expect(signIn({ email: "one@example.test", password: "wrong" })).rejects.toMatchObject({
      status: 401,
      code: "invalid_credentials",
    });
    const { token } = await signIn({ email: "one@example.test", password });
    const auth = await resolveSession(token);
    expect(auth?.principal.email).toBe("one@example.test");
    expect(auth?.impersonating).toBe(false);

    await revokeSession(auth!.session.id);
    expect(await resolveSession(token)).toBeUndefined();
    expect(await resolveSession("bogus")).toBeUndefined();
  });

  it("admins create only their own operators; operators create nobody", async () => {
    const { adminOneRow, opOne } = await setup();
    const op = (await findUserById(opOne.id))!;
    expect(op.admin_id).toBe(adminOneRow.id);
    await expect(createManagedUser({ user: op }, { email: "x@example.test", password })).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      createManagedUser({ user: adminOneRow }, { email: "o1@example.test", password }),
    ).rejects.toMatchObject({ status: 409, code: "email_taken" });
  });

  it("applies the §2.2 impersonation rules", async () => {
    const { root, adminOneRow, adminTwoRow, opOne, opTwo } = await setup();
    const opOneRow = (await findUserById(opOne.id))!;
    const opTwoRow = (await findUserById(opTwo.id))!;

    expect(canImpersonate(root, adminOneRow)).toBe(true);
    expect(canImpersonate(root, opTwoRow)).toBe(true);
    expect(canImpersonate(adminOneRow, opOneRow)).toBe(true);
    expect(canImpersonate(adminOneRow, opTwoRow)).toBe(false);
    expect(canImpersonate(adminOneRow, adminTwoRow)).toBe(false);
    expect(canImpersonate(opOneRow, opTwoRow)).toBe(false);

    const { token } = await signIn({ email: "one@example.test", password });
    let auth = (await resolveSession(token))!;

    // other admin's operator looks nonexistent
    await expect(startImpersonation(auth, opTwo.id)).rejects.toMatchObject({ status: 404 });

    await startImpersonation(auth, opOne.id);
    auth = (await resolveSession(token))!;
    expect(auth.impersonating).toBe(true);
    expect(auth.actor.user.id).toBe(opOne.id);
    expect(auth.actor.via?.id).toBe(adminOneRow.id);

    // no nesting
    await expect(startImpersonation(auth, opOne.id)).rejects.toMatchObject({ status: 409 });

    await stopImpersonation(auth);
    auth = (await resolveSession(token))!;
    expect(auth.impersonating).toBe(false);
  });

  it("records the trail with the via marker and survives account deletion", async () => {
    const { adminOneRow, opOne } = await setup();
    const { token } = await signIn({ email: "one@example.test", password });
    const auth = (await resolveSession(token))!;
    await startImpersonation(auth, opOne.id);
    const acting = (await resolveSession(token))!;

    // an action performed as the operator, via the admin
    await resetManagedPassword({ user: adminOneRow }, opOne.id, "another password!");
    const { entries } = await listActivity({ adminId: adminOneRow.id });
    const started = entries.find((e) => e.action === "impersonation.started");
    expect(started?.actor.email).toBe("one@example.test");
    expect(started?.objectId).toBe(opOne.id);
    expect(acting.actor.via?.email).toBe("one@example.test");

    // the reset revoked the operator's sessions, not the admin's
    expect(await resolveSession(token)).toBeDefined();

    // deleting the account keeps the trail naming it
    await db()("sessions").where({ user_id: opOne.id }).delete();
    await db()("users").where({ id: opOne.id }).delete();
    const after = await listActivity({ adminId: adminOneRow.id });
    const created = after.entries.find((e) => e.action === "operator.created");
    expect(created?.details).toMatchObject({ email: "o1@example.test" });
  });

  it("wraps failures as DomainError with the spec's status codes", async () => {
    const error = await createSuperadmin({ email: "bad", password: "x" }).catch((e) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.status).toBe(422);
  });
});
