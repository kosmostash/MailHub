import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runSenderBatch } from "@/domain/sending";
import { type FakeSmtp, startFakeSmtp } from "./helpers/fake-smtp";
import { type Client, startServer, type TestServer } from "./helpers/server";

/** Spec §8 steps 5, 6 and 7 over HTTP: sender, approve, send, bulk, send to me, webhooks. */
let server: TestServer;
let smtp: FakeSmtp;
beforeAll(async () => {
  [server, smtp] = await Promise.all([startServer(), startFakeSmtp()]);
});
afterAll(async () => {
  await Promise.all([server.stop(), smtp.stop()]);
});

const password = "correct horse battery";
const admin = (path: string) => `/admin/api${path}`;

describe("sending over the APIs", () => {
  let operator: Client;
  let collectionA: string;
  let collectionB: string;
  let emailA: string;
  let emailB: string;
  let bulkOne: string;
  let bulkTwo: string;

  it("sets up an operator, a provider pointing at the fake SMTP server, and two collections", async () => {
    const root = server.client();
    if ((await root.get(admin("/auth/bootstrap"))).body.needed) {
      await root.post(admin("/auth/bootstrap"), { email: "root@example.test", password });
    } else {
      await root.post(admin("/auth/sign-in"), { email: "root@example.test", password });
    }
    await root.post(admin("/admins"), { email: "send-admin@example.test", password });
    const adminOne = server.client();
    await adminOne.post(admin("/auth/sign-in"), { email: "send-admin@example.test", password });
    const provider = await adminOne.post(admin("/providers"), {
      name: "Fake",
      type: "smtp",
      config: { host: "127.0.0.1", port: smtp.port, secure: false },
    });
    expect(provider.status).toBe(201);
    await adminOne.post(admin("/operators"), { email: "send-op@example.test", password });

    operator = server.client();
    expect((await operator.post(admin("/auth/sign-in"), { email: "send-op@example.test", password })).status).toBe(200);
    collectionA = (await operator.post(admin("/collections"), { name: "A", providerId: provider.body.provider.id })).body.collection.id;
    collectionB = (await operator.post(admin("/collections"), { name: "B", scheduleMode: "immediate", providerId: provider.body.provider.id })).body.collection.id;
  });

  it("step 5: the background sender delivers B's email without human action", async () => {
    const client = server.client();
    const payload = { from: "app@example.test", to: ["user@example.test"], subject: "immediate", text: "hi" };
    emailB = (await client.post("/api/emails", payload, { "x-collection-id": collectionB })).body.id;
    emailA = (await client.post("/api/emails", { ...payload, subject: "needs review" }, { "x-collection-id": collectionA })).body.id;

    expect(await runSenderBatch()).toMatchObject({ claimed: 1, sent: 1 });
    const polled = await client.get(`/api/emails/${emailB}`, { "x-collection-id": collectionB });
    expect(polled.body).toMatchObject({ state: "sent", deliveryStatus: "sent" });
    expect(smtp.messages.map((m) => m.subject)).toEqual(["immediate"]);
  });

  it("step 6: A's email lists first as pending; approve, then send", async () => {
    const list = await operator.get(admin(`/collections/${collectionA}/emails`));
    expect(list.body.emails[0]).toMatchObject({ id: emailA, state: "pending" });

    expect((await operator.post(admin("/emails/send"), { ids: [emailA] })).body.outcomes[0]).toMatchObject({ ok: false, code: "not_ready" });
    const approved = await operator.post(admin(`/emails/${emailA}/approve`));
    expect(approved.status).toBe(200);
    expect(approved.body.email.state).toBe("ready");

    const sent = await operator.post(admin("/emails/send"), { ids: [emailA] });
    expect(sent.status).toBe(200);
    expect(sent.body.outcomes[0]).toMatchObject({ id: emailA, ok: true, email: { state: "sent" } });
    expect(smtp.messages.map((m) => m.subject)).toEqual(["immediate", "needs review"]);
  });

  it("step 6: bulk send reports per email, and send to me needs a test address", async () => {
    const client = server.client();
    const payload = { from: "app@example.test", to: ["user@example.test"], text: "hi" };
    bulkOne = (await client.post("/api/emails", { ...payload, subject: "bulk one" }, { "x-collection-id": collectionA })).body.id;
    bulkTwo = (await client.post("/api/emails", { ...payload, subject: "bulk two" }, { "x-collection-id": collectionA })).body.id;
    await operator.post(admin(`/emails/${bulkOne}/approve`));

    const bulk = await operator.post(admin("/emails/send"), { ids: [bulkOne, bulkTwo, "00000000-0000-0000-0000-000000000000"] });
    expect(bulk.body.outcomes).toMatchObject([
      { id: bulkOne, ok: true },
      { id: bulkTwo, ok: false, code: "not_ready" },
      { ok: false, code: "not_found" },
    ]);

    expect((await operator.get(admin("/account/test-addresses"))).body.testAddresses).toEqual([]);
    const created = await operator.post(admin("/account/test-addresses"), { address: "me@example.test", label: "Me" });
    expect(created.status).toBe(201);
    const before = smtp.messages.length;
    const test = await operator.post(admin(`/emails/${bulkTwo}/send-to-me`), { testAddressId: created.body.testAddress.id });
    expect(test.status).toBe(200);
    expect(test.body).toEqual({ ok: true, sentTo: "me@example.test" });
    expect(smtp.messages[before]!.subject).toBe("[test] bulk two");
    expect((await operator.get(admin(`/emails/${bulkTwo}`))).body.email).toMatchObject({ state: "pending", attempts: 0 });
  });

  it("step 7: webhook events update delivery status and the client sees them", async () => {
    const client = server.client();
    const sentB = await client.get(`/api/emails/${emailB}`, { "x-collection-id": collectionB });
    const res = await client.post("/webhooks/fake", {
      events: [
        { emailId: emailA, status: "delivered" },
        { messageId: sentB.body.providerMessageId, status: "bounced" },
        { emailId: "00000000-0000-0000-0000-000000000000", status: "delivered" },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ provider: "fake", matched: 2, unmatched: 1 });
    expect((await client.get(`/api/emails/${emailA}`, { "x-collection-id": collectionA })).body.deliveryStatus).toBe("delivered");
    expect((await client.get(`/api/emails/${emailB}`, { "x-collection-id": collectionB })).body.deliveryStatus).toBe("bounced");

    const bad = await client.post("/webhooks/fake", { events: [{ status: "lost" }] });
    expect(bad.status).toBe(422);
  });

  it("overseers cannot approve or send in their own identity", async () => {
    const adminOne = server.client();
    await adminOne.post(admin("/auth/sign-in"), { email: "send-admin@example.test", password });
    expect((await adminOne.post(admin(`/emails/${bulkTwo}/approve`))).status).toBe(403);
    expect((await adminOne.post(admin("/emails/send"), { ids: [bulkTwo] })).status).toBe(403);
    expect((await adminOne.get(admin("/account/test-addresses"))).status).toBe(403);
  });
});

describe("governance over the APIs (spec §8 steps 8, 10, 11)", () => {
  let root: Client;
  let adminOne: Client;
  let operator: Client;
  let adminOneId: string;
  let operatorId: string;
  let collectionA: string;
  let sentEmailId: string;

  it("sets up admin one with an operator, a provider and a collection", async () => {
    root = server.client();
    await root.post(admin("/auth/sign-in"), { email: "root@example.test", password });
    adminOneId = (await root.post(admin("/admins"), { email: "gov-admin@example.test", password })).body.user.id;
    adminOne = server.client();
    await adminOne.post(admin("/auth/sign-in"), { email: "gov-admin@example.test", password });
    const provider = await adminOne.post(admin("/providers"), { name: "Fake", type: "smtp", config: { host: "127.0.0.1", port: smtp.port, secure: false } });
    operatorId = (await adminOne.post(admin("/operators"), { email: "gov-op@example.test", password })).body.user.id;
    // impersonated setup, so the trail carries the via marker
    await adminOne.post(admin("/impersonation"), { userId: operatorId });
    collectionA = (await adminOne.post(admin("/collections"), { name: "A", scheduleMode: "immediate", providerId: provider.body.provider.id })).body.collection.id;
    await adminOne.delete(admin("/impersonation"));
    operator = server.client();
    await operator.post(admin("/auth/sign-in"), { email: "gov-op@example.test", password });
  });

  it("step 8: the trail marks impersonated actions; disable stops sessions, submissions and sending", async () => {
    const trail = await adminOne.get(admin("/activity"));
    const created = trail.body.entries.find((e: { action: string }) => e.action === "collection.created");
    expect(created).toMatchObject({ actor: { email: "gov-op@example.test" }, via: { email: "gov-admin@example.test" } });

    const client = server.client();
    sentEmailId = (await client.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], subject: "before", text: "t" }, { "x-collection-id": collectionA })).body.id;
    await runSenderBatch();
    const held = (await client.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], subject: "held", text: "t" }, { "x-collection-id": collectionA })).body.id;

    expect((await adminOne.post(admin(`/operators/${operatorId}/disable`))).status).toBe(200);
    expect((await operator.get(admin("/me"))).status).toBe(401);
    const refused = await client.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], text: "t" }, { "x-collection-id": collectionA });
    expect(refused.status).toBe(403);
    expect(await runSenderBatch()).toMatchObject({ claimed: 0 });
    expect((await client.get(`/api/emails/${held}`, { "x-collection-id": collectionA })).status).toBe(403);

    expect((await adminOne.post(admin(`/operators/${operatorId}/enable`))).status).toBe(200);
    expect((await operator.post(admin("/auth/sign-in"), { email: "gov-op@example.test", password })).status).toBe(200);
    expect(await runSenderBatch()).toMatchObject({ claimed: 1, sent: 1 });
    expect((await client.get(`/api/emails/${held}`, { "x-collection-id": collectionA })).body.state).toBe("sent");
  });

  it("step 10: disabling admin one revokes the whole subtree; webhooks still update; re-enable resumes", async () => {
    const client = server.client();
    const held = (await client.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], subject: "held again", text: "t" }, { "x-collection-id": collectionA })).body.id;

    expect((await root.post(admin(`/admins/${adminOneId}/disable`))).status).toBe(200);
    expect((await adminOne.get(admin("/me"))).status).toBe(401);
    expect((await operator.get(admin("/me"))).status).toBe(401);
    expect((await server.client().post(admin("/auth/sign-in"), { email: "gov-op@example.test", password })).status).toBe(401);
    expect(await runSenderBatch()).toMatchObject({ claimed: 0 });
    const refused = await client.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], text: "t" }, { "x-collection-id": collectionA });
    expect(refused.status).toBe(403);
    expect(refused.body.error.details).toEqual({ reason: "admin_disabled" });

    const hook = await client.post("/webhooks/fake", { events: [{ emailId: sentEmailId, status: "delivered" }] });
    expect(hook.body).toMatchObject({ matched: 1 });

    expect((await root.post(admin(`/admins/${adminOneId}/enable`))).status).toBe(200);
    expect((await adminOne.post(admin("/auth/sign-in"), { email: "gov-admin@example.test", password })).status).toBe(200);
    expect(await runSenderBatch()).toMatchObject({ claimed: 1, sent: 1 });
    expect((await client.get(`/api/emails/${held}`, { "x-collection-id": collectionA })).body.state).toBe("sent");

    const trail = await root.get(admin("/activity"));
    const actions = trail.body.entries.filter((e: { actor: { role: string } }) => e.actor.role === "superadmin").map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["admin.disabled", "admin.enabled"]));
  });

  it("step 11: delete refused while populated; disable, reassign (ids kept), then delete", async () => {
    await operator.post(admin("/auth/sign-in"), { email: "gov-op@example.test", password });
    expect((await adminOne.delete(admin(`/operators/${operatorId}`))).status).toBe(409);
    const o2 = (await adminOne.post(admin("/operators"), { email: "gov-op2@example.test", password })).body.user.id;

    expect((await adminOne.post(admin(`/operators/${operatorId}/disable`))).status).toBe(200);
    const stillPopulated = await adminOne.delete(admin(`/operators/${operatorId}`));
    expect(stillPopulated.status).toBe(409);
    expect(stillPopulated.body.error.code).toBe("not_empty");

    const targets = await adminOne.get(admin(`/operators/${operatorId}/reassign`));
    expect(targets.body.targets.map((t: { email: string }) => t.email)).toEqual(["gov-op2@example.test"]);
    const moved = await adminOne.post(admin(`/operators/${operatorId}/reassign`), { targetId: o2 });
    expect(moved.status).toBe(200);
    expect(moved.body.summary).toMatchObject({ collections: 1 });

    const client = server.client();
    const after = await client.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], subject: "after move", text: "t" }, { "x-collection-id": collectionA });
    expect(after.status).toBe(201);
    expect(await runSenderBatch()).toMatchObject({ sent: 1 });

    expect((await adminOne.delete(admin(`/operators/${operatorId}`))).status).toBe(200);
    expect((await adminOne.get(admin("/operators"))).body.operators.map((o: { email: string }) => o.email)).toEqual(["gov-op2@example.test"]);

    // and at the top: an emptied, disabled admin is deletable, a populated one is not
    const emptyAdmin = (await root.post(admin("/admins"), { email: "empty@example.test", password })).body.user.id;
    expect((await root.delete(admin(`/admins/${emptyAdmin}`))).status).toBe(409);
    await root.post(admin(`/admins/${emptyAdmin}/disable`));
    expect((await root.delete(admin(`/admins/${emptyAdmin}`))).status).toBe(200);
    await root.post(admin(`/admins/${adminOneId}/disable`));
    expect((await root.delete(admin(`/admins/${adminOneId}`))).body.error.code).toBe("not_empty");
    await root.post(admin(`/admins/${adminOneId}/enable`));
  });
});
