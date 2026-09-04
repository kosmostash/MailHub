import * as OTPAuth from "otpauth";
import { beforeEach, describe, expect, it } from "vitest";

import { truncateAll } from "../setup";
import { type FakeSmtp, startFakeSmtp } from "../helpers/fake-smtp";

import { createSuperadmin } from "@/domain/accounts/bootstrap";
import { findUserById } from "@/domain/accounts/users";
import {
  confirmEmailChange,
  confirmPasswordChange,
  confirmTotpEnrollment,
  disableTotp,
  requestEmailChange,
  requestPasswordChange,
  startTotpEnrollment,
} from "@/domain/confirmation";
import { db } from "@/domain/db";
import { resolveSession, signIn } from "@/domain/sessions";
import { resetSystemMailTransport } from "@/domain/system-mail";

const password = "correct horse battery";
const codeIn = (smtp: FakeSmtp) => smtp.messages.at(-1)!.text!.match(/code is (\d{6})/)![1]!;

let smtp: FakeSmtp;
beforeEach(async () => {
  await truncateAll();
  smtp = await startFakeSmtp();
  process.env.MAILHUB_SYSTEM_SMTP_URL = `smtp://127.0.0.1:${smtp.port}`;
  resetSystemMailTransport();
  return async () => {
    await smtp.stop();
  };
});

describe("email change", () => {
  it("sends the code to the new address and applies only once confirmed", async () => {
    const user = await createSuperadmin({ email: "root@example.test", password });
    await expect(requestEmailChange(user, "not-an-email")).rejects.toMatchObject({ status: 422 });
    await expect(requestEmailChange(user, "root@example.test")).rejects.toMatchObject({ status: 422 });

    const req = await requestEmailChange(user, "new@example.test");
    expect(req).toMatchObject({ method: "email", sentTo: "new@example.test" });
    expect(smtp.messages).toHaveLength(1);
    expect(smtp.messages[0]!.envelope.to).toEqual(["new@example.test"]);
    expect((await findUserById(user.id))!.email).toBe("root@example.test");

    await expect(confirmEmailChange(user, "000000")).rejects.toMatchObject({ status: 401, code: "invalid_code" });
    const updated = await confirmEmailChange(user, codeIn(smtp));
    expect(updated.email).toBe("new@example.test");
    // single use
    await expect(confirmEmailChange(updated, codeIn(smtp))).rejects.toMatchObject({ code: "no_pending_change" });
    // never a stored email
    expect(await db()("emails").count("* as n").first()).toMatchObject({ n: "0" });
    expect(await db()("system_emails").where({ purpose: "email_change" }).count("* as n").first()).toMatchObject({ n: "1" });
  });

  it("expires, voids after five wrong codes, and rate-limits requests", async () => {
    const user = await createSuperadmin({ email: "root@example.test", password });
    await requestEmailChange(user, "a@example.test");
    for (let i = 0; i < 5; i++) {
      await expect(confirmEmailChange(user, "111111")).rejects.toMatchObject({ code: "invalid_code" });
    }
    await expect(confirmEmailChange(user, codeIn(smtp))).rejects.toMatchObject({ code: "no_pending_change" });

    await requestEmailChange(user, "b@example.test");
    await db()("confirmation_codes").update({ expires_at: new Date(Date.now() - 1000) });
    await expect(confirmEmailChange(user, codeIn(smtp))).rejects.toMatchObject({ code: "no_pending_change" });

    await requestEmailChange(user, "c@example.test");
    await expect(requestEmailChange(user, "d@example.test")).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });
});

describe("password change", () => {
  it("sends the code to the current address, applies it, and signs out other sessions", async () => {
    const user = await createSuperadmin({ email: "root@example.test", password });
    const keep = await signIn({ email: "root@example.test", password });
    const other = await signIn({ email: "root@example.test", password });
    const keepSession = (await resolveSession(keep.token))!.session.id;

    await expect(requestPasswordChange(user, "short")).rejects.toMatchObject({ status: 422 });
    const req = await requestPasswordChange(user, "a brand new password");
    expect(req).toMatchObject({ method: "email", sentTo: "root@example.test" });
    expect(smtp.messages[0]!.envelope.to).toEqual(["root@example.test"]);

    await expect(signIn({ email: "root@example.test", password: "a brand new password" })).rejects.toMatchObject({ code: "invalid_credentials" });
    await confirmPasswordChange(user, codeIn(smtp), keepSession);
    expect((await signIn({ email: "root@example.test", password: "a brand new password" })).user.id).toBe(user.id);
    expect(await resolveSession(keep.token)).toBeDefined();
    expect(await resolveSession(other.token)).toBeUndefined();
  });
});

describe("second factor", () => {
  it("gates sign-in and replaces the emailed code once enrolled", async () => {
    let user = await createSuperadmin({ email: "root@example.test", password });
    const { secret, uri } = await startTotpEnrollment(user);
    expect(uri).toContain("otpauth://totp/");
    const totp = new OTPAuth.TOTP({ issuer: "MailHub", label: user.email, secret: OTPAuth.Secret.fromBase32(secret) });
    user = (await findUserById(user.id))!;
    // not enabled until confirmed: sign-in still plain
    expect((await signIn({ email: "root@example.test", password })).user.id).toBe(user.id);
    await expect(confirmTotpEnrollment(user, "000000")).rejects.toMatchObject({ code: "invalid_code" });
    await confirmTotpEnrollment(user, totp.generate());
    user = (await findUserById(user.id))!;

    await expect(signIn({ email: "root@example.test", password })).rejects.toMatchObject({ code: "totp_required" });
    await expect(signIn({ email: "root@example.test", password, totpCode: "000000" })).rejects.toMatchObject({ code: "totp_required" });
    expect((await signIn({ email: "root@example.test", password, totpCode: totp.generate() })).user.id).toBe(user.id);

    const req = await requestEmailChange(user, "new@example.test");
    expect(req).toMatchObject({ method: "totp", sentTo: null });
    expect(smtp.messages).toHaveLength(0);
    await expect(confirmEmailChange(user, "000000")).rejects.toMatchObject({ code: "invalid_code" });
    expect((await confirmEmailChange(user, totp.generate())).email).toBe("new@example.test");

    user = (await findUserById(user.id))!;
    await expect(disableTotp(user, "000000")).rejects.toMatchObject({ code: "invalid_code" });
    await disableTotp(user, totp.generate());
    expect((await signIn({ email: "new@example.test", password })).user.id).toBe(user.id);
  });
});
