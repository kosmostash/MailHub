import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/domain/db";
import { type FakeSmtp, startFakeSmtp } from "./helpers/fake-smtp";
import { type Client, startServer, type TestServer } from "./helpers/server";

/** Spec §8 step 9 over HTTP: credential changes refused without the code, applied with it. */
let server: TestServer;
let smtp: FakeSmtp;
beforeAll(async () => {
  smtp = await startFakeSmtp();
  process.env.MAILHUB_SYSTEM_SMTP_URL = `smtp://127.0.0.1:${smtp.port}`;
  server = await startServer();
});
afterAll(async () => {
  await Promise.all([server.stop(), smtp.stop()]);
});

const password = "correct horse battery";
const admin = (path: string) => `/admin/api${path}`;
const codeIn = () => smtp.messages.at(-1)!.text!.match(/code is (\d{6})/)![1]!;

describe("own account over the API", () => {
  let root: Client;
  let adminOne: Client;
  let operatorId: string;

  it("signs in the superadmin and an admin", async () => {
    root = server.client();
    if ((await root.get(admin("/auth/bootstrap"))).body.needed) {
      await root.post(admin("/auth/bootstrap"), { email: "root@example.test", password });
    } else {
      await root.post(admin("/auth/sign-in"), { email: "root@example.test", password });
    }
    await root.post(admin("/admins"), { email: "acct-admin@example.test", password });
    adminOne = server.client();
    await adminOne.post(admin("/auth/sign-in"), { email: "acct-admin@example.test", password });
    operatorId = (await adminOne.post(admin("/operators"), { email: "acct-op@example.test", password })).body.user.id;
  });

  it("changes the email only with the code sent to the new address", async () => {
    const before = smtp.messages.length;
    const req = await adminOne.post(admin("/account/email"), { newEmail: "renamed@example.test" });
    expect(req.status).toBe(200);
    expect(req.body.confirmation).toMatchObject({ method: "email", sentTo: "renamed@example.test" });
    expect(smtp.messages.length).toBe(before + 1);
    expect(smtp.messages.at(-1)!.envelope.to).toEqual(["renamed@example.test"]);

    expect((await adminOne.get(admin("/me"))).body.principal.email).toBe("acct-admin@example.test");
    const wrong = await adminOne.post(admin("/account/email/confirm"), { code: "000000" });
    expect(wrong.status).toBe(401);
    const ok = await adminOne.post(admin("/account/email/confirm"), { code: codeIn() });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe("renamed@example.test");
    expect((await adminOne.get(admin("/me"))).body.principal.email).toBe("renamed@example.test");

    // the confirmation code never shows up as a stored email
    expect(await db()("emails").count("* as n").first()).toMatchObject({ n: "0" });
  });

  it("changes the password only with the code sent to the current address", async () => {
    const req = await root.post(admin("/account/password"), { newPassword: "root new password" });
    expect(req.body.confirmation).toMatchObject({ method: "email", sentTo: "root@example.test" });
    expect((await server.client().post(admin("/auth/sign-in"), { email: "root@example.test", password: "root new password" })).status).toBe(401);
    expect((await root.post(admin("/account/password/confirm"), { code: "000000" })).status).toBe(401);
    expect((await root.post(admin("/account/password/confirm"), { code: codeIn() })).status).toBe(200);
    expect((await server.client().post(admin("/auth/sign-in"), { email: "root@example.test", password: "root new password" })).status).toBe(200);
    // the confirming session survives
    expect((await root.get(admin("/me"))).status).toBe(200);
  });

  it("refuses credential changes while impersonating", async () => {
    await adminOne.post(admin("/impersonation"), { userId: operatorId });
    const res = await adminOne.post(admin("/account/password"), { newPassword: "whatever it is" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("impersonating");
    await adminOne.delete(admin("/impersonation"));
  });

  it("enrols a second factor that then gates sign-in", async () => {
    const OTPAuth = await import("otpauth");
    const start = await adminOne.post(admin("/account/totp"));
    expect(start.status).toBe(200);
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(start.body.secret) });
    expect((await adminOne.post(admin("/account/totp/confirm"), { code: "000000" })).status).toBe(401);
    expect((await adminOne.post(admin("/account/totp/confirm"), { code: totp.generate() })).status).toBe(200);
    expect((await adminOne.get(admin("/me"))).body.principal.totpEnabled).toBe(true);

    const fresh = server.client();
    const noCode = await fresh.post(admin("/auth/sign-in"), { email: "renamed@example.test", password });
    expect(noCode.status).toBe(401);
    expect(noCode.body.error.code).toBe("totp_required");
    expect((await fresh.post(admin("/auth/sign-in"), { email: "renamed@example.test", password, totpCode: totp.generate() })).status).toBe(200);

    // credential changes now use the authenticator, no email goes out
    const before = smtp.messages.length;
    const req = await fresh.post(admin("/account/password"), { newPassword: "second factor pw" });
    expect(req.body.confirmation.method).toBe("totp");
    expect(smtp.messages.length).toBe(before);
    expect((await fresh.post(admin("/account/password/confirm"), { code: totp.generate() })).status).toBe(200);
  });
});
