import { beforeEach, describe, expect, it } from "vitest";

import { truncateAll } from "../setup";
import { closedPort, startFakeSmtp } from "../helpers/fake-smtp";

import { createSuperadmin } from "@/domain/accounts/bootstrap";
import { createTestAddress, deleteTestAddress, listTestAddresses } from "@/domain/accounts/test-addresses";
import type { Actor } from "@/domain/accounts/types";
import { createManagedUser, findUserById } from "@/domain/accounts/users";
import { listActivity } from "@/domain/activity";
import { createCollection, updateCollection } from "@/domain/collections";
import { db } from "@/domain/db";
import { getEmail, resolveSubmissionTarget, storeEmail } from "@/domain/emails";
import { createProvider } from "@/domain/providers";
import {
  applyDeliveryEvents,
  approveEmail,
  claimReadyEmails,
  runSenderBatch,
  sendEmailsExplicitly,
  sendToMe,
} from "@/domain/sending";

const password = "correct horse battery";

const setup = async (providerPort: number) => {
  const root: Actor = { user: await createSuperadmin({ email: "root@example.test", password }) };
  const a1 = await createManagedUser(root, { email: "one@example.test", password });
  const adminOne: Actor = { user: (await findUserById(a1.id))! };
  const o1 = await createManagedUser(adminOne, { email: "o1@example.test", password });
  const opOne: Actor = { user: (await findUserById(o1.id))! };
  const provider = await createProvider(adminOne, {
    name: "Fake",
    type: "smtp",
    config: { host: "127.0.0.1", port: providerPort, secure: false },
  });
  const a = await createCollection(opOne, { name: "A", providerId: provider.id });
  const b = await createCollection(opOne, { name: "B", scheduleMode: "immediate", providerId: provider.id });
  const noProvider = await createCollection(opOne, { name: "C", scheduleMode: "immediate" });
  const col = async (id: string) => {
    const t = await resolveSubmissionTarget(id);
    if (t.status !== "ok") throw new Error("setup");
    return t.collection;
  };
  return { root, adminOne, opOne, provider, a, b, noProvider, colA: await col(a.id), colB: await col(b.id), colC: await col(noProvider.id) };
};

const submission = (subject: string) => ({
  from: { address: "app@example.test", name: "App" },
  to: ["user@example.test"],
  cc: ["cc@example.test"],
  subject,
  text: `body of ${subject}`,
  html: `<p>${subject}</p>`,
});

beforeEach(async () => {
  await truncateAll();
});

describe("background sender", () => {
  it("drains ready emails with a provider, oldest first, and records the send", async () => {
    const smtp = await startFakeSmtp();
    try {
      const { colA, colB, colC, opOne, adminOne } = await setup(smtp.port);
      const pending = await storeEmail(colA, submission("pending one"), "http");
      const first = await storeEmail(colB, submission("first"), "http");
      const second = await storeEmail(colB, submission("second"), "http");
      const orphan = await storeEmail(colC, submission("no provider"), "http");

      expect(await runSenderBatch(1)).toEqual({ claimed: 1, sent: 1, failed: 0 });
      expect((await getEmail(opOne, first.id)).state).toBe("sent");
      expect((await getEmail(opOne, second.id)).state).toBe("ready");

      expect(await runSenderBatch()).toEqual({ claimed: 1, sent: 1, failed: 0 });
      expect(await runSenderBatch()).toEqual({ claimed: 0, sent: 0, failed: 0 });

      const sent = await getEmail(opOne, second.id);
      expect(sent).toMatchObject({ state: "sent", deliveryStatus: "sent", attempts: 0, lastError: null });
      expect(sent.sentAt).not.toBeNull();
      expect(sent.providerMessageId).toBeTruthy();
      expect((await getEmail(opOne, pending.id)).state).toBe("pending");
      expect((await getEmail(opOne, orphan.id)).state).toBe("ready");

      expect(smtp.messages.map((m) => m.subject)).toEqual(["first", "second"]);
      expect(smtp.messages[0]!.envelope.to).toEqual(["user@example.test", "cc@example.test"]);
      expect(smtp.messages[0]!.from?.text).toContain("app@example.test");

      const trail = await listActivity({ adminId: adminOne.user.id });
      const entry = trail.entries.find((e) => e.action === "email.sent" && e.objectId === first.id);
      expect(entry?.actor.role).toBe("system");
      expect(entry?.details).toMatchObject({ explicit: false });
    } finally {
      await smtp.stop();
    }
  });

  it("stops after three failures until a human sends explicitly", async () => {
    const port = await closedPort();
    const { colB, opOne } = await setup(port);
    const email = await storeEmail(colB, submission("doomed"), "http");

    for (let attempt = 1; attempt <= 3; attempt++) {
      expect(await runSenderBatch()).toEqual({ claimed: 1, sent: 0, failed: 1 });
      const view = await getEmail(opOne, email.id);
      expect(view).toMatchObject({ state: "ready", attempts: attempt });
      expect(view.lastError).toMatch(/ECONNREFUSED|connect/i);
    }
    expect(await runSenderBatch()).toEqual({ claimed: 0, sent: 0, failed: 0 });

    // explicit send ignores the cap; the provider is still down, so it fails cleanly
    const [outcome] = await sendEmailsExplicitly(opOne, [email.id]);
    expect(outcome).toMatchObject({ id: email.id, ok: false, code: "provider_error" });
    expect((await getEmail(opOne, email.id)).attempts).toBe(4);
  });

  it("skips emails whose operator or admin is disabled, and resumes after re-enable", async () => {
    const smtp = await startFakeSmtp();
    try {
      const { colB, opOne, adminOne } = await setup(smtp.port);
      await storeEmail(colB, submission("held"), "http");

      await db()("users").where({ id: opOne.user.id }).update({ disabled_at: new Date() });
      expect(await claimReadyEmails()).toEqual([]);
      await db()("users").where({ id: opOne.user.id }).update({ disabled_at: null });
      await db()("users").where({ id: adminOne.user.id }).update({ disabled_at: new Date() });
      expect(await claimReadyEmails()).toEqual([]);
      await db()("users").where({ id: adminOne.user.id }).update({ disabled_at: null });

      expect(await runSenderBatch()).toMatchObject({ sent: 1 });
    } finally {
      await smtp.stop();
    }
  });

  it("never claims a leased email twice", async () => {
    const smtp = await startFakeSmtp();
    try {
      const { colB } = await setup(smtp.port);
      await storeEmail(colB, submission("once"), "http");
      const first = await claimReadyEmails();
      expect(first).toHaveLength(1);
      expect(await claimReadyEmails()).toEqual([]);
      await db()("emails").where({ id: first[0]!.id }).update({ lease_until: new Date(Date.now() - 1000) });
      expect(await claimReadyEmails()).toHaveLength(1);
    } finally {
      await smtp.stop();
    }
  });
});

describe("approve and explicit send", () => {
  it("moves pending to ready, refuses other transitions, sends with per-id outcomes", async () => {
    const smtp = await startFakeSmtp();
    try {
      const { colA, colC, opOne, adminOne } = await setup(smtp.port);
      const email = await storeEmail(colA, submission("review me"), "http");
      const orphan = await storeEmail(colC, submission("no provider"), "http");

      await expect(approveEmail(adminOne, email.id)).rejects.toMatchObject({ status: 403 });
      const approved = await approveEmail(opOne, email.id);
      expect(approved.state).toBe("ready");
      expect(approved.reviewedAt).not.toBeNull();
      await expect(approveEmail(opOne, email.id)).rejects.toMatchObject({ status: 409, code: "not_pending" });

      await expect(sendEmailsExplicitly(adminOne, [email.id])).rejects.toMatchObject({ status: 403 });
      const outcomes = await sendEmailsExplicitly(opOne, [
        email.id,
        orphan.id,
        "00000000-0000-0000-0000-000000000000",
        email.id,
      ]);
      expect(outcomes).toHaveLength(3);
      expect(outcomes[0]).toMatchObject({ id: email.id, ok: true, email: { state: "sent" } });
      expect(outcomes[1]).toMatchObject({ id: orphan.id, ok: false, code: "no_provider" });
      expect(outcomes[2]).toMatchObject({ ok: false, code: "not_found" });

      // a sent email is terminal
      const again = await sendEmailsExplicitly(opOne, [email.id]);
      expect(again[0]).toMatchObject({ ok: false, code: "not_ready" });
      expect(smtp.messages).toHaveLength(1);

      const trail = await listActivity({ operatorId: opOne.user.id });
      expect(trail.entries.map((e) => e.action)).toEqual(
        expect.arrayContaining(["email.approved", "email.sent"]),
      );
      const sentEntry = trail.entries.find((e) => e.action === "email.sent");
      expect(sentEntry?.actor.email).toBe("o1@example.test");
      expect(sentEntry?.details).toMatchObject({ explicit: true });
    } finally {
      await smtp.stop();
    }
  });
});

describe("send to me", () => {
  it("delivers a [test] copy to a test address and leaves the email untouched", async () => {
    const smtp = await startFakeSmtp();
    try {
      const { colA, colC, opOne, adminOne, a } = await setup(smtp.port);
      const email = await storeEmail(colA, submission("draft"), "http");

      await expect(listTestAddresses(adminOne)).rejects.toMatchObject({ status: 403 });
      await expect(createTestAddress(opOne, { address: "nope" })).rejects.toMatchObject({ status: 422 });
      const older = await createTestAddress(opOne, { address: "me@example.test", label: "Me" });
      const newer = await createTestAddress(opOne, { address: "me2@example.test" });
      expect((await listTestAddresses(opOne)).map((t) => t.id)).toEqual([newer.id, older.id]);

      const { sentTo } = await sendToMe(opOne, email.id, older.id);
      expect(sentTo).toBe("me@example.test");
      const copy = smtp.messages[0]!;
      expect(copy.subject).toBe("[test] draft");
      expect(copy.envelope.to).toEqual(["me@example.test"]);
      expect(copy.text?.trim()).toBe("body of draft");

      const after = await getEmail(opOne, email.id);
      expect(after).toMatchObject({ state: "pending", attempts: 0, deliveryStatus: "unknown", sentAt: null });

      // works in every state, needs a provider, and only the operator's own addresses
      const orphan = await storeEmail(colC, submission("x"), "http");
      await expect(sendToMe(opOne, orphan.id, older.id)).rejects.toMatchObject({ status: 422, code: "no_provider" });
      await expect(sendToMe(adminOne, email.id, older.id)).rejects.toMatchObject({ status: 403 });
      await deleteTestAddress(opOne, older.id);
      await expect(sendToMe(opOne, email.id, older.id)).rejects.toMatchObject({ status: 404 });
      await updateCollection(opOne, a.id, { providerId: null });
      await expect(sendToMe(opOne, email.id, newer.id)).rejects.toMatchObject({ code: "no_provider" });
    } finally {
      await smtp.stop();
    }
  });
});

describe("delivery events", () => {
  it("updates by email id or message id and counts unmatched", async () => {
    const smtp = await startFakeSmtp();
    try {
      const { colB, opOne } = await setup(smtp.port);
      const one = await storeEmail(colB, submission("one"), "http");
      const two = await storeEmail(colB, submission("two"), "http");
      await runSenderBatch();
      const twoSent = await getEmail(opOne, two.id);

      const result = await applyDeliveryEvents([
        { emailId: one.id, status: "delivered" },
        { messageId: twoSent.providerMessageId!, status: "bounced" },
        { emailId: "00000000-0000-0000-0000-000000000000", status: "delivered" },
        { emailId: "not-a-uuid", status: "delivered" },
        { messageId: "<unknown@nowhere>", status: "sent" },
        { status: "sent" },
      ]);
      expect(result).toEqual({ matched: 2, unmatched: 4 });
      expect((await getEmail(opOne, one.id)).deliveryStatus).toBe("delivered");
      expect((await getEmail(opOne, two.id)).deliveryStatus).toBe("bounced");
    } finally {
      await smtp.stop();
    }
  });
});
