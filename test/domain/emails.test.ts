import nodemailer from "nodemailer";
import { beforeEach, describe, expect, it } from "vitest";

import { truncateAll } from "../setup";

import { createSuperadmin } from "@/domain/accounts/bootstrap";
import type { Actor } from "@/domain/accounts/types";
import { createManagedUser, findUserById } from "@/domain/accounts/users";
import { createCollection } from "@/domain/collections";
import { db } from "@/domain/db";
import {
  getEmail,
  getSubmittedEmail,
  listEmails,
  normalizeSubmission,
  resolveSubmissionTarget,
  storeEmail,
} from "@/domain/emails";
import { createSmtpListener } from "@/domain/ingest/smtp";

const password = "correct horse battery";

const setup = async () => {
  const root: Actor = { user: await createSuperadmin({ email: "root@example.test", password }) };
  const a1 = await createManagedUser(root, { email: "one@example.test", password });
  const adminOne: Actor = { user: (await findUserById(a1.id))! };
  const o1 = await createManagedUser(adminOne, { email: "o1@example.test", password });
  const o1b = await createManagedUser(adminOne, { email: "o1b@example.test", password });
  const opOne: Actor = { user: (await findUserById(o1.id))! };
  const opOneB: Actor = { user: (await findUserById(o1b.id))! };
  const a = await createCollection(opOne, { name: "A" });
  const b = await createCollection(opOne, { name: "B", scheduleMode: "immediate" });
  const targetA = await resolveSubmissionTarget(a.id);
  const targetB = await resolveSubmissionTarget(b.id);
  if (targetA.status !== "ok" || targetB.status !== "ok") throw new Error("setup");
  return { root, adminOne, opOne, opOneB, a, b, colA: targetA.collection, colB: targetB.collection };
};

const submission = {
  from: "app@example.test",
  to: ["user@example.test", { address: "two@example.test", name: "Two" }],
  subject: "Hello",
  text: "Hi there",
};

beforeEach(async () => {
  await truncateAll();
});

describe("submission validation", () => {
  it("normalizes addresses and requires a body and a recipient", () => {
    const n = normalizeSubmission({ ...submission, cc: [" cc@example.test "], html: "<p>hi</p>" });
    expect(n.from).toEqual({ address: "app@example.test" });
    expect(n.to[1]).toEqual({ address: "two@example.test", name: "Two" });
    expect(n.cc).toEqual([{ address: "cc@example.test" }]);
    expect(n.bcc).toEqual([]);

    expect(() => normalizeSubmission({ from: "nope", to: ["x@y.z"], text: "t" })).toThrow(/invalid/);
    expect(() => normalizeSubmission({ from: "a@b.c", to: [], text: "t" })).toThrowError(
      expect.objectContaining({ status: 422, details: expect.arrayContaining([expect.objectContaining({ field: "to" })]) }),
    );
    expect(() => normalizeSubmission({ from: "a@b.c", to: ["x@y.z"] })).toThrowError(
      expect.objectContaining({ details: expect.arrayContaining([expect.objectContaining({ field: "body" })]) }),
    );
  });
});

describe("submission target", () => {
  it("distinguishes unknown, suspended and ok", async () => {
    const { a, opOne, adminOne } = await setup();
    expect(await resolveSubmissionTarget(undefined)).toEqual({ status: "unknown" });
    expect(await resolveSubmissionTarget("nope")).toEqual({ status: "unknown" });
    expect((await resolveSubmissionTarget(a.id)).status).toBe("ok");

    await db()("users").where({ id: opOne.user.id }).update({ disabled_at: new Date() });
    expect((await resolveSubmissionTarget(a.id)).status).toBe("operator_disabled");
    await db()("users").where({ id: opOne.user.id }).update({ disabled_at: null });
    await db()("users").where({ id: adminOne.user.id }).update({ disabled_at: new Date() });
    expect((await resolveSubmissionTarget(a.id)).status).toBe("admin_disabled");
  });
});

describe("storing and reading", () => {
  it("starts pending or ready per schedule mode, and polls per collection", async () => {
    const { colA, colB } = await setup();
    const inA = await storeEmail(colA, submission, "http");
    const inB = await storeEmail(colB, submission, "http");
    expect(inA.state).toBe("pending");
    expect(inB.state).toBe("ready");
    expect(inA.deliveryStatus).toBe("unknown");
    expect(inA.to).toEqual([{ address: "user@example.test" }, { address: "two@example.test", name: "Two" }]);

    expect((await getSubmittedEmail(colA.id, inA.id)).id).toBe(inA.id);
    await expect(getSubmittedEmail(colB.id, inA.id)).rejects.toMatchObject({ status: 404 });
  });

  it("lists pending first, then newest, with filters and pages, in scope only", async () => {
    const { root, adminOne, opOne, opOneB, colA, a } = await setup();
    const first = await storeEmail(colA, { ...submission, subject: "first" }, "http");
    await db()("emails").where({ id: first.id }).update({ state: "sent", delivery_status: "delivered" });
    await storeEmail(colA, { ...submission, subject: "second" }, "http");
    await storeEmail(colA, { ...submission, subject: "third" }, "smtp");

    const all = await listEmails(opOne, a.id);
    expect(all.total).toBe(3);
    expect(all.emails.map((e) => e.subject)).toEqual(["third", "second", "first"]);

    expect((await listEmails(opOne, a.id, { state: "sent" })).emails.map((e) => e.subject)).toEqual(["first"]);
    expect((await listEmails(opOne, a.id, { delivery: "delivered" })).total).toBe(1);
    const page2 = await listEmails(opOne, a.id, { page: 2, pageSize: 2 });
    expect(page2.emails.map((e) => e.subject)).toEqual(["first"]);

    expect((await listEmails(adminOne, a.id)).total).toBe(3);
    expect((await listEmails(root, a.id)).total).toBe(3);
    await expect(listEmails(opOneB, a.id)).rejects.toMatchObject({ status: 404 });

    expect((await getEmail(adminOne, first.id)).subject).toBe("first");
    await expect(getEmail(opOneB, first.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("smtp ingestion", () => {
  it("accepts mail authenticated with the collection id, stores it, rejects bad credentials", async () => {
    const { colA, colB, opOne, a } = await setup();
    const listener = createSmtpListener({ host: "127.0.0.1", port: 0, maxMessageBytes: 1024 * 1024 });
    const port = await listener.start();
    try {
      const send = (pass: string) =>
        nodemailer
          .createTransport({ host: "127.0.0.1", port, secure: false, auth: { user: "mailhub", pass }, tls: { rejectUnauthorized: false } })
          .sendMail({
            from: '"Legacy App" <legacy@example.test>',
            to: "user@example.test",
            cc: "cc@example.test",
            bcc: "hidden@example.test",
            subject: "Over SMTP",
            text: "plain",
            html: "<p>rich</p>",
          });

      const info = await send(colA.id);
      expect(info.response).toMatch(/Stored as/);
      const stored = (await listEmails(opOne, a.id)).emails[0]!;
      expect(stored).toMatchObject({
        state: "pending",
        source: "smtp",
        subject: "Over SMTP",
        from: { address: "legacy@example.test", name: "Legacy App" },
        to: [{ address: "user@example.test" }],
        cc: [{ address: "cc@example.test" }],
        bcc: [{ address: "hidden@example.test" }],
        text: "plain",
      });
      expect(stored.html).toContain("<p>rich</p>");

      // the id in the username works too; immediate collections start ready
      const asUser = nodemailer.createTransport({ host: "127.0.0.1", port, secure: false, auth: { user: colB.id, pass: "x" } });
      await asUser.sendMail({ from: "a@example.test", to: "b@example.test", subject: "B", text: "t" });
      const inB = await db()("emails").where({ collection_id: colB.id }).first();
      expect(inB.state).toBe("ready");

      await expect(send("bogus")).rejects.toMatchObject({ responseCode: 535 });

      await db()("users").where({ id: opOne.user.id }).update({ disabled_at: new Date() });
      await expect(send(colA.id)).rejects.toMatchObject({ responseCode: 535, response: expect.stringContaining("suspended") });
    } finally {
      await listener.stop();
    }
  });
});
