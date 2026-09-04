import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/domain/db";
import { type Client, startServer, type TestServer } from "./helpers/server";

/** Spec §8 step 4 over HTTP: submit, poll, bogus id, no body; suspension → 403. */
let server: TestServer;
beforeAll(async () => {
  server = await startServer();
});
afterAll(async () => {
  await server.stop();
});

const password = "correct horse battery";
const admin = (path: string) => `/admin/api${path}`;

describe("submission API", () => {
  let collectionA: string;
  let collectionB: string;
  let operatorId: string;
  let emailInA: string;

  it("needs a known collection id", async () => {
    const anon: Client = server.client();
    expect((await anon.get("/api/health")).body).toEqual({ ok: true });
    const missing = await anon.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], text: "t" });
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("unknown_collection");
    const bogus = await anon.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], text: "t" }, { "x-collection-id": "bogus" });
    expect(bogus.status).toBe(401);
  });

  it("sets up an operator with two collections", async () => {
    const root = server.client();
    if ((await root.get(admin("/auth/bootstrap"))).body.needed) {
      await root.post(admin("/auth/bootstrap"), { email: "root@example.test", password });
    } else {
      await root.post(admin("/auth/sign-in"), { email: "root@example.test", password });
    }
    const adminRes = await root.post(admin("/admins"), { email: "sub-admin@example.test", password });
    const adminOne = server.client();
    await adminOne.post(admin("/auth/sign-in"), { email: "sub-admin@example.test", password });
    const op = await adminOne.post(admin("/operators"), { email: "sub-op@example.test", password });
    operatorId = op.body.user.id;
    await adminOne.post(admin("/impersonation"), { userId: operatorId });
    collectionA = (await adminOne.post(admin("/collections"), { name: "A" })).body.collection.id;
    collectionB = (await adminOne.post(admin("/collections"), { name: "B", scheduleMode: "immediate" })).body.collection.id;
    expect(adminRes.status).toBe(201);
  });

  it("submits: pending in A, ready in B, 422 without a body", async () => {
    const client = server.client();
    const payload = { from: { address: "app@example.test", name: "App" }, to: ["user@example.test"], subject: "Hi", html: "<b>hi</b>" };
    const a = await client.post("/api/emails", payload, { "x-collection-id": collectionA });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ state: "pending", deliveryStatus: "unknown", subject: "Hi", source: "http", from: { address: "app@example.test", name: "App" } });
    emailInA = a.body.id;

    const b = await client.post("/api/emails", payload, { "x-collection-id": collectionB });
    expect(b.status).toBe(201);
    expect(b.body.state).toBe("ready");

    const noBody = await client.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], subject: "s" }, { "x-collection-id": collectionA });
    expect(noBody.status).toBe(422);
    expect(noBody.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: "body" })]));
    const badShape = await client.post("/api/emails", { from: "a@b.c", subject: "s", text: "t" }, { "x-collection-id": collectionA });
    expect(badShape.status).toBe(422);
  });

  it("polls per collection", async () => {
    const client = server.client();
    const own = await client.get(`/api/emails/${emailInA}`, { "x-collection-id": collectionA });
    expect(own.status).toBe(200);
    expect(own.body.id).toBe(emailInA);
    expect((await client.get(`/api/emails/${emailInA}`, { "x-collection-id": collectionB })).status).toBe(404);
    expect((await client.get(`/api/emails/${emailInA}`)).status).toBe(401);
  });

  it("refuses submissions to a suspended collection with 403, distinct from 401", async () => {
    await db()("users").where({ id: operatorId }).update({ disabled_at: new Date() });
    try {
      const res = await server.client().post("/api/emails", { from: "a@b.c", to: ["x@y.z"], text: "t" }, { "x-collection-id": collectionA });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({ code: "collection_suspended", details: { reason: "operator_disabled" } });
    } finally {
      await db()("users").where({ id: operatorId }).update({ disabled_at: null });
    }
  });
});
