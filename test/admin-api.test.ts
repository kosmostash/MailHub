import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Client, startServer, type TestServer } from "./helpers/server";

/**
 * Spec §8 steps 1 and 2 over HTTP, against the built dispatcher:
 * bootstrap once, admins are mutually invisible, impersonation is scoped and audited.
 * */
let server: TestServer;
beforeAll(async () => {
  server = await startServer();
});
afterAll(async () => {
  await server.stop();
});

const password = "correct horse battery";
const api = (path: string) => `/admin/api${path}`;

describe("admin API, phase 1", () => {
  let root: Client;
  let adminOne: Client;
  let adminTwo: Client;
  let adminOneId: string;
  let adminTwoId: string;
  let opOneId: string;
  let opTwoId: string;

  it("refuses everything without a session", async () => {
    const anon = server.client();
    const res = await anon.get(api("/me"));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "unauthenticated", message: "Sign in required" } });
    expect((await anon.get(api("/admins"))).status).toBe(401);
  });

  it("proposes bootstrap once, then never again", async () => {
    root = server.client();
    expect((await root.get(api("/auth/bootstrap"))).body).toEqual({ needed: true });

    const bad = await root.post(api("/auth/bootstrap"), { email: "not-an-email", password });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("invalid");

    const created = await root.post(api("/auth/bootstrap"), { email: "root@example.test", password });
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({ role: "superadmin", email: "root@example.test" });
    expect(root.hasCookie("mh_session")).toBe(true);

    expect((await root.get(api("/auth/bootstrap"))).body).toEqual({ needed: false });
    const again = await server.client().post(api("/auth/bootstrap"), { email: "second@example.test", password });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("superadmin_exists");

    const me = await root.get(api("/me"));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ impersonating: false, actor: { role: "superadmin" } });
  });

  it("lets the superadmin create admins, and admins create operators", async () => {
    const one = await root.post(api("/admins"), { email: "one@example.test", password });
    expect(one.status).toBe(201);
    adminOneId = one.body.user.id;
    const two = await root.post(api("/admins"), { email: "two@example.test", password });
    adminTwoId = two.body.user.id;

    // superadmin holds no operator management in its own identity
    expect((await root.get(api("/operators"))).status).toBe(403);

    adminOne = server.client();
    const signIn = await adminOne.post(api("/auth/sign-in"), { email: "one@example.test", password });
    expect(signIn.status).toBe(200);
    adminTwo = server.client();
    await adminTwo.post(api("/auth/sign-in"), { email: "two@example.test", password });

    const wrong = await server.client().post(api("/auth/sign-in"), { email: "one@example.test", password: "nope" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("invalid_credentials");

    const op1 = await adminOne.post(api("/operators"), { email: "o1@example.test", password });
    expect(op1.status).toBe(201);
    expect(op1.body.user).toMatchObject({ role: "operator", adminId: adminOneId });
    opOneId = op1.body.user.id;
    const op2 = await adminTwo.post(api("/operators"), { email: "o2@example.test", password });
    opTwoId = op2.body.user.id;

    // admins cannot manage admins
    expect((await adminOne.get(api("/admins"))).status).toBe(403);
    expect((await adminOne.post(api("/admins"), { email: "x@example.test", password })).status).toBe(403);
  });

  it("keeps admins mutually invisible", async () => {
    const listOne = await adminOne.get(api("/operators"));
    expect(listOne.body.operators.map((o: { email: string }) => o.email)).toEqual(["o1@example.test"]);
    const listTwo = await adminTwo.get(api("/operators"));
    expect(listTwo.body.operators.map((o: { email: string }) => o.email)).toEqual(["o2@example.test"]);

    // the other admin's operator behaves like a nonexistent id
    expect((await adminOne.post(api(`/operators/${opTwoId}/password`), { password })).status).toBe(404);
    expect((await adminOne.post(api("/impersonation"), { userId: opTwoId })).status).toBe(404);
    expect((await adminOne.post(api("/impersonation"), { userId: adminTwoId })).status).toBe(404);

    const summary = await root.get(api("/admins"));
    expect(summary.status).toBe(200);
    expect(summary.body.admins).toHaveLength(2);
    expect(summary.body.admins[0]).toMatchObject({ email: "one@example.test", operators: 1, providers: 0 });
  });

  it("impersonates within scope, visibly, without nesting", async () => {
    const start = await adminOne.post(api("/impersonation"), { userId: opOneId });
    expect(start.status).toBe(200);
    expect(start.body.actor.email).toBe("o1@example.test");

    const me = await adminOne.get(api("/me"));
    expect(me.body).toMatchObject({
      impersonating: true,
      principal: { email: "one@example.test" },
      actor: { email: "o1@example.test", role: "operator" },
    });

    // acting as an operator: no operator management
    expect((await adminOne.get(api("/operators"))).status).toBe(403);
    // and no nesting
    expect((await adminOne.post(api("/impersonation"), { userId: opOneId })).status).toBe(409);

    const end = await adminOne.delete(api("/impersonation"));
    expect(end.status).toBe(200);
    expect((await adminOne.get(api("/me"))).body.impersonating).toBe(false);

    // the superadmin may impersonate an admin and gets the admin's powers
    expect((await root.post(api("/impersonation"), { userId: adminTwoId })).status).toBe(200);
    const asTwo = await root.get(api("/operators"));
    expect(asTwo.body.operators.map((o: { email: string }) => o.email)).toEqual(["o2@example.test"]);
    await root.delete(api("/impersonation"));
  });

  it("resets passwords administratively and revokes the target's sessions", async () => {
    const op = server.client();
    expect((await op.post(api("/auth/sign-in"), { email: "o1@example.test", password })).status).toBe(200);
    expect((await op.get(api("/me"))).status).toBe(200);

    expect((await adminOne.post(api(`/operators/${opOneId}/password`), { password: "a new password" })).status).toBe(200);
    expect((await op.get(api("/me"))).status).toBe(401);
    expect((await op.post(api("/auth/sign-in"), { email: "o1@example.test", password })).status).toBe(401);
    expect((await op.post(api("/auth/sign-in"), { email: "o1@example.test", password: "a new password" })).status).toBe(200);
  });

  it("signs out", async () => {
    expect((await adminTwo.post(api("/auth/sign-out"))).status).toBe(200);
    expect(adminTwo.hasCookie("mh_session")).toBe(false);
    expect((await adminTwo.get(api("/me"))).status).toBe(401);
  });
});
