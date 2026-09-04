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

describe("admin API, phase 2: providers and collections (spec §8 step 3)", () => {
  let root: Client;
  let adminOne: Client;
  let providerId: string;
  let collectionA: string;
  let collectionB: string;

  it("sets up the accounts", async () => {
    root = server.client();
    await root.post(api("/auth/sign-in"), { email: "root@example.test", password });
    adminOne = server.client();
    await adminOne.post(api("/auth/sign-in"), { email: "one@example.test", password });
  });

  it("lets admin one create an SMTP provider, masked in responses", async () => {
    expect((await adminOne.get(api("/provider-types"))).body.types[0]).toMatchObject({ type: "smtp", implemented: true });
    const bad = await adminOne.post(api("/providers"), { name: "Main", type: "smtp", config: { host: "", port: 0 } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: "host" })]));

    const created = await adminOne.post(api("/providers"), {
      name: "Main",
      type: "smtp",
      config: { host: "smtp.example.test", port: 587, secure: false, user: "u", pass: "hunter2" },
    });
    expect(created.status).toBe(201);
    providerId = created.body.provider.id;
    expect(created.body.provider.config.pass).not.toBe("hunter2");

    // operators never see configs; the superadmin sees masked configs across admins
    const asRoot = await root.get(api("/providers"));
    expect(asRoot.body.providers).toHaveLength(1);
    expect(asRoot.body.providers[0].config.pass).not.toBe("hunter2");
    expect((await root.post(api("/providers"), { name: "x", type: "smtp", config: {} })).status).toBe(403);
  });

  it("creates collections as the impersonated operator, assigning the provider", async () => {
    const operators = await adminOne.get(api("/operators"));
    const opOneId = operators.body.operators[0].id;
    expect((await adminOne.post(api("/collections"), { name: "A" })).status).toBe(403);

    expect((await adminOne.post(api("/impersonation"), { userId: opOneId })).status).toBe(200);
    const list = await adminOne.get(api("/providers"));
    expect(list.body.providers[0]).toMatchObject({ name: "Main", type: "smtp", config: null });

    const a = await adminOne.post(api("/collections"), { name: "A", scheduleMode: "after_review", providerId });
    expect(a.status).toBe(201);
    expect(a.body.collection).toMatchObject({ name: "A", scheduleMode: "after_review", provider: { id: providerId } });
    collectionA = a.body.collection.id;
    const b = await adminOne.post(api("/collections"), { name: "B", scheduleMode: "immediate", providerId });
    collectionB = b.body.collection.id;
    expect(collectionA).toHaveLength(32);
    expect(collectionA).not.toBe(collectionB);

    expect((await adminOne.delete(api("/impersonation"))).status).toBe(200);
  });

  it("shows the admin both collections read-only and refuses the provider delete", async () => {
    const list = await adminOne.get(api("/collections"));
    expect(list.body.collections.map((c: { name: string }) => c.name)).toEqual(["A", "B"]);
    expect(list.body.collections[0].operator.email).toBe("o1@example.test");
    expect((await adminOne.patch(api(`/collections/${collectionA}`), { name: "Z" })).status).toBe(403);
    expect((await adminOne.delete(api(`/collections/${collectionA}`))).status).toBe(403);

    const conflict = await adminOne.delete(api(`/providers/${providerId}`));
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("provider_in_use");

    // other admin: nothing
    const adminTwo = server.client();
    await adminTwo.post(api("/auth/sign-in"), { email: "two@example.test", password });
    expect((await adminTwo.get(api("/collections"))).body.collections).toEqual([]);
    expect((await adminTwo.get(api(`/collections/${collectionA}`))).status).toBe(404);
    expect((await adminTwo.get(api(`/providers/${providerId}`))).status).toBe(404);

    // superadmin: everything, and per-admin drill-down
    expect((await root.get(api("/collections"))).body.collections).toHaveLength(2);
    const adminTwoId = (await root.get(api("/admins"))).body.admins[1].id;
    expect((await root.get(api(`/collections?adminId=${adminTwoId}`))).body.collections).toEqual([]);
  });
});
