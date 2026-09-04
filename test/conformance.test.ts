import { spawn, type ChildProcess } from "node:child_process";

import nodemailer from "nodemailer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/domain/db";
import { createSmtpListener } from "@/domain/ingest/smtp";
import { type FakeSmtp, startFakeSmtp } from "./helpers/fake-smtp";
import { type Client, startServer, type TestServer } from "./helpers/server";

/**
 * Spec §8, the conformance walk-through, end to end and in order: the built dispatcher,
 * the real background sender process, the SMTP ingestion listener, a fake provider and a
 * fake system-mail server. Everything the spec calls "without any human action" is done
 * by the worker, not by calling into the domain.
 * */
let server: TestServer;
let provider: FakeSmtp;
let systemMail: FakeSmtp;
let sender: ChildProcess;
let ingest: ReturnType<typeof createSmtpListener>;
let ingestPort: number;

const password = "correct horse battery";
const admin = (path: string) => `/admin/api${path}`;
const until = async (check: () => Promise<boolean>, what: string, ms = 10_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
};

beforeAll(async () => {
  [provider, systemMail] = await Promise.all([startFakeSmtp(), startFakeSmtp()]);
  process.env.MAILHUB_SYSTEM_SMTP_URL = `smtp://127.0.0.1:${systemMail.port}`;
  server = await startServer();
  ingest = createSmtpListener({ host: "127.0.0.1", port: 0, maxMessageBytes: 1024 * 1024 });
  ingestPort = await ingest.start();
  sender = spawn(process.execPath, ["dist/workers/sender.js"], {
    env: { ...process.env, NODE_ENV: "test", MAILHUB_SENDER_INTERVAL_MS: "150", MAILHUB_SENDER_BATCH_SIZE: "5" },
    stdio: ["ignore", "ignore", "inherit"],
  });
}, 60_000);

afterAll(async () => {
  sender.kill("SIGTERM");
  await new Promise((r) => sender.once("exit", r));
  await Promise.all([server.stop(), provider.stop(), systemMail.stop(), ingest.stop()]);
});

describe("spec §8 conformance walk-through", () => {
  let root: Client;
  let adminOne: Client;
  let adminTwo: Client;
  let o1: Client;
  let adminOneId: string;
  let adminTwoId: string;
  let o1Id: string;
  let providerId: string;
  let A: string;
  let B: string;
  let emailA: string;
  let emailB: string;
  let emailSmtp: string;

  it("1. fresh install proposes the superadmin, once", async () => {
    root = server.client();
    expect((await root.get(admin("/auth/bootstrap"))).body).toEqual({ needed: true });
    expect((await root.post(admin("/auth/bootstrap"), { email: "root@example.test", password })).status).toBe(201);
    expect((await root.get(admin("/auth/bootstrap"))).body).toEqual({ needed: false });
    expect((await server.client().post(admin("/auth/bootstrap"), { email: "x@example.test", password })).status).toBe(409);
  });

  it("2. two admins, mutually invisible, both visible to the superadmin", async () => {
    adminOneId = (await root.post(admin("/admins"), { email: "one@example.test", password })).body.user.id;
    adminTwoId = (await root.post(admin("/admins"), { email: "two@example.test", password })).body.user.id;
    adminOne = server.client();
    adminTwo = server.client();
    await adminOne.post(admin("/auth/sign-in"), { email: "one@example.test", password });
    await adminTwo.post(admin("/auth/sign-in"), { email: "two@example.test", password });
    expect((await root.get(admin("/admins"))).body.admins).toHaveLength(2);
  });

  it("3. admin one creates a provider and O1, impersonates O1 to create A and B", async () => {
    providerId = (
      await adminOne.post(admin("/providers"), { name: "SMTP", type: "smtp", config: { host: "127.0.0.1", port: provider.port, secure: false } })
    ).body.provider.id;
    o1Id = (await adminOne.post(admin("/operators"), { email: "o1@example.test", password })).body.user.id;
    expect((await adminOne.post(admin("/impersonation"), { userId: o1Id })).status).toBe(200);
    expect((await adminOne.get(admin("/me"))).body.impersonating).toBe(true);
    A = (await adminOne.post(admin("/collections"), { name: "A", scheduleMode: "after_review", providerId })).body.collection.id;
    B = (await adminOne.post(admin("/collections"), { name: "B", scheduleMode: "immediate", providerId })).body.collection.id;
    await adminOne.delete(admin("/impersonation"));
    // admin two sees none of it
    expect((await adminTwo.get(admin("/collections"))).body.collections).toEqual([]);
    expect((await adminTwo.get(admin(`/collections/${A}`))).status).toBe(404);
    expect((await root.get(admin("/collections"))).body.collections).toHaveLength(2);
  });

  it("4. submissions over HTTP and SMTP", async () => {
    const c = server.client();
    const payload = { from: "app@example.test", to: ["user@example.test"], subject: "hello", text: "hi" };
    const a = await c.post("/api/emails", payload, { "x-collection-id": A });
    expect(a.status).toBe(201);
    expect(a.body.state).toBe("pending");
    emailA = a.body.id;
    const b = await c.post("/api/emails", payload, { "x-collection-id": B });
    expect(b.body.state).toBe("ready");
    emailB = b.body.id;
    expect((await c.post("/api/emails", payload, { "x-collection-id": "bogus" })).status).toBe(401);
    expect((await c.post("/api/emails", { from: "a@b.c", to: ["x@y.z"] }, { "x-collection-id": A })).status).toBe(422);

    const smtpClient = (pass: string) =>
      nodemailer.createTransport({ host: "127.0.0.1", port: ingestPort, secure: false, auth: { user: "mailhub", pass } });
    await smtpClient(A).sendMail({ from: "legacy@example.test", to: "user@example.test", subject: "over smtp", text: "t" });
    const list = await root.get(admin(`/collections/${A}/emails`));
    const stored = list.body.emails.find((e: { subject: string }) => e.subject === "over smtp");
    expect(stored).toMatchObject({ state: "pending", source: "smtp" });
    emailSmtp = stored.id;
    await expect(smtpClient("bogus").sendMail({ from: "a@b.c", to: "x@y.z", text: "t" })).rejects.toMatchObject({ responseCode: 535 });
  });

  it("5. the background sender delivers B's email on its own", async () => {
    const c = server.client();
    await until(async () => (await c.get(`/api/emails/${emailB}`, { "x-collection-id": B })).body.state === "sent", "B's email to be sent");
    expect((await c.get(`/api/emails/${emailB}`, { "x-collection-id": B })).body.deliveryStatus).toBe("sent");
    expect(provider.messages.map((m) => m.subject)).toEqual(["hello"]);
  });

  it("6. O1 reviews A: approve, send, test address, send to me", async () => {
    o1 = server.client();
    expect((await o1.post(admin("/auth/sign-in"), { email: "o1@example.test", password })).status).toBe(200);
    const list = await o1.get(admin(`/collections/${A}/emails`));
    expect(list.body.emails.every((e: { state: string }) => e.state === "pending")).toBe(true);

    expect((await o1.post(admin(`/emails/${emailA}/approve`))).body.email.state).toBe("ready");
    const sent = await o1.post(admin("/emails/send"), { ids: [emailA] });
    expect(sent.body.outcomes[0]).toMatchObject({ ok: true, email: { state: "sent" } });

    const t = await o1.post(admin("/account/test-addresses"), { address: "me@example.test" });
    const before = provider.messages.length;
    expect((await o1.post(admin(`/emails/${emailSmtp}/send-to-me`), { testAddressId: t.body.testAddress.id })).status).toBe(200);
    expect(provider.messages[before]!.subject).toBe("[test] over smtp");
    expect((await o1.get(admin(`/emails/${emailSmtp}`))).body.email).toMatchObject({ state: "pending", attempts: 0 });
  });

  it("7. webhook events reach the submitting client", async () => {
    const c = server.client();
    const res = await c.post("/webhooks/smtp", { events: [{ emailId: emailA, status: "delivered" }, { emailId: emailB, status: "bounced" }] });
    expect(res.body).toMatchObject({ matched: 2, unmatched: 0 });
    expect((await c.get(`/api/emails/${emailA}`, { "x-collection-id": A })).body.deliveryStatus).toBe("delivered");
    expect((await c.get(`/api/emails/${emailB}`, { "x-collection-id": B })).body.deliveryStatus).toBe("bounced");
  });

  it("8. admin one: read-only dashboard, impersonation in the trail, provider conflict, disable O1", async () => {
    const dash = await adminOne.get(admin("/collections"));
    expect(dash.body.collections.map((c: { name: string; counters: { sent: number } }) => [c.name, c.counters.sent])).toEqual([["A", 1], ["B", 1]]);
    expect((await adminOne.post(admin(`/emails/${emailSmtp}/approve`))).status).toBe(403);
    expect((await adminOne.patch(admin(`/collections/${A}`), { name: "Z" })).status).toBe(403);
    const trail = await adminOne.get(admin("/activity"));
    const viaEntries = trail.body.entries.filter((e: { via: unknown }) => e.via);
    expect(viaEntries.some((e: { action: string }) => e.action === "collection.created")).toBe(true);
    expect((await adminOne.delete(admin(`/providers/${providerId}`))).status).toBe(409);

    const c = server.client();
    const held = (await c.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], subject: "held", text: "t" }, { "x-collection-id": B })).body.id;
    await until(async () => (await c.get(`/api/emails/${held}`, { "x-collection-id": B })).body.state === "sent", "held email to be sent before the disable");
    expect((await adminOne.post(admin(`/operators/${o1Id}/disable`))).status).toBe(200);
    expect((await o1.get(admin("/me"))).status).toBe(401);
    expect((await c.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], text: "t" }, { "x-collection-id": A })).status).toBe(403);
    await adminOne.post(admin(`/operators/${o1Id}/enable`));
    expect((await o1.post(admin("/auth/sign-in"), { email: "o1@example.test", password })).status).toBe(200);
  });

  it("9. credential changes need the emailed code", async () => {
    const req = await adminTwo.post(admin("/account/password"), { newPassword: "two new password" });
    expect(req.body.confirmation.sentTo).toBe("two@example.test");
    expect((await adminTwo.post(admin("/account/password/confirm"), { code: "000000" })).status).toBe(401);
    const code = systemMail.messages.at(-1)!.text!.match(/code is (\d{6})/)![1]!;
    expect((await adminTwo.post(admin("/account/password/confirm"), { code })).status).toBe(200);
    expect((await server.client().post(admin("/auth/sign-in"), { email: "two@example.test", password: "two new password" })).status).toBe(200);
    expect(await db()("emails").where("subject", "like", "%MailHub%").count("* as n").first()).toMatchObject({ n: "0" });
  });

  it("10. disabling admin one stops the subtree; webhooks still update; re-enable resumes", async () => {
    const c = server.client();
    const held = (await c.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], subject: "held by admin", text: "t" }, { "x-collection-id": B })).body.id;
    // make sure the sender does not race the disable: submit, then disable at once, then observe
    expect((await root.post(admin(`/admins/${adminOneId}/disable`))).status).toBe(200);
    expect((await adminOne.get(admin("/me"))).status).toBe(401);
    expect((await o1.get(admin("/me"))).status).toBe(401);
    expect((await server.client().post(admin("/auth/sign-in"), { email: "o1@example.test", password })).status).toBe(401);
    expect((await c.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], text: "t" }, { "x-collection-id": A })).status).toBe(403);
    await new Promise((r) => setTimeout(r, 600));
    const state = (await c.get(`/api/emails/${held}`, { "x-collection-id": B })).status;
    expect(state).toBe(403); // polling is refused too while suspended
    expect((await c.post("/webhooks/smtp", { events: [{ emailId: emailA, status: "bounced" }] })).body.matched).toBe(1);

    expect((await root.post(admin(`/admins/${adminOneId}/enable`))).status).toBe(200);
    await until(async () => (await c.get(`/api/emails/${held}`, { "x-collection-id": B })).body.state === "sent", "held email to resume after re-enable");
    const trail = await root.get(admin("/activity"));
    expect(trail.body.entries.filter((e: { actor: { role: string } }) => e.actor.role === "superadmin").map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(["admin.disabled", "admin.enabled"]),
    );
  });

  it("11. reassignment and deletion at both levels", async () => {
    await adminOne.post(admin("/auth/sign-in"), { email: "one@example.test", password });
    expect((await adminOne.delete(admin(`/operators/${o1Id}`))).status).toBe(409);
    const o2 = (await adminOne.post(admin("/operators"), { email: "o2@example.test", password })).body.user.id;
    await adminOne.post(admin(`/operators/${o1Id}/disable`));
    expect((await adminOne.post(admin(`/operators/${o1Id}/reassign`), { targetId: o2 })).body.summary.collections).toBe(2);
    const c = server.client();
    expect((await c.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], subject: "after move", text: "t" }, { "x-collection-id": A })).status).toBe(201);
    const moved = (await c.post("/api/emails", { from: "a@b.c", to: ["x@y.z"], subject: "after move B", text: "t" }, { "x-collection-id": B })).body.id;
    await until(async () => (await c.get(`/api/emails/${moved}`, { "x-collection-id": B })).body.state === "sent", "mail to resume under O2");
    expect((await adminOne.delete(admin(`/operators/${o1Id}`))).status).toBe(200);

    expect((await root.delete(admin(`/admins/${adminTwoId}`))).status).toBe(409);
    await root.post(admin(`/admins/${adminTwoId}/disable`));
    expect((await root.delete(admin(`/admins/${adminTwoId}`))).status).toBe(200);
    await root.post(admin(`/admins/${adminOneId}/disable`));
    expect((await root.delete(admin(`/admins/${adminOneId}`))).body.error.code).toBe("not_empty");
  });
});
