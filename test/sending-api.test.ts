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
