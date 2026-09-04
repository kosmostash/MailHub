import type { Knex } from "knex";

import { db, withTransaction } from "../db";
import { conflict, invalid, isUniqueViolation, unauthenticated } from "../errors";
import { confirmationCode, sha256 } from "../ids";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../passwords";
import { recordActivity } from "../activity";
import type { UserRow } from "../accounts/types";
import { findUserByEmail } from "../accounts/users";
import { revokeSessionsForUsers } from "../sessions";
import { sendSystemEmail } from "../system-mail";
import { hasTotp, verifyTotp } from "./totp";

export * from "./totp";

/**
 * The credential-change gate (spec §2.1.7): a change applies only once confirmed - by
 * the enrolled second factor when there is one, otherwise by a one-time code emailed to
 * the new address (email change) or the current address (password change).
 * */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

type Purpose = "email_change" | "password_change";

type CodeRow = {
  id: string;
  user_id: string;
  purpose: Purpose;
  code_hash: string;
  payload: Record<string, string>;
  sent_to: string;
  expires_at: Date;
  consumed_at: Date | null;
  attempts: number;
  created_at: Date;
};

export type ConfirmationRequest = { method: "totp" | "email"; sentTo: string | null; expiresAt: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Issue a pending change; a new request voids the previous one for the same purpose. */
const issue = async (
  user: UserRow,
  purpose: Purpose,
  payload: Record<string, string>,
  sentTo: string,
  mail: { subject: string; text: (code: string) => string },
): Promise<ConfirmationRequest> => {
  const totp = hasTotp(user);
  const code = totp ? null : confirmationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  if (code) {
    await sendSystemEmail({ to: sentTo, subject: mail.subject, text: mail.text(code), purpose, userId: user.id });
  }
  await withTransaction(async (trx) => {
    await trx("confirmation_codes").where({ user_id: user.id, purpose }).whereNull("consumed_at").update({ consumed_at: trx.fn.now() });
    await trx("confirmation_codes").insert({
      user_id: user.id,
      purpose,
      code_hash: code ? sha256(`${user.id}:${code}`) : "",
      payload: JSON.stringify(payload),
      sent_to: sentTo,
      expires_at: expiresAt,
    });
  });
  return { method: totp ? "totp" : "email", sentTo: totp ? null : sentTo, expiresAt: expiresAt.toISOString() };
};

/** Find the live pending change and check the code; wrong codes count, and five void it. */
const consume = async (user: UserRow, purpose: Purpose, code: string, trx: Knex): Promise<CodeRow> => {
  const row = await trx<CodeRow>("confirmation_codes")
    .where({ user_id: user.id, purpose })
    .whereNull("consumed_at")
    .orderBy("created_at", "desc")
    .first();
  if (!row || row.expires_at.getTime() < Date.now()) {
    throw invalid("No pending change, or the code expired; request a new one", undefined, "no_pending_change");
  }
  const valid = hasTotp(user) ? verifyTotp(user, code) : row.code_hash === sha256(`${user.id}:${code.trim()}`);
  if (!valid) {
    // recorded outside the caller's transaction: the throw below rolls that one back
    const attempts = row.attempts + 1;
    const knex = db();
    await knex("confirmation_codes")
      .where({ id: row.id })
      .update(attempts >= MAX_CODE_ATTEMPTS ? { attempts, consumed_at: knex.fn.now() } : { attempts });
    throw unauthenticated(
      attempts >= MAX_CODE_ATTEMPTS ? "Too many wrong codes; request a new one" : "The code is not valid",
      "invalid_code",
    );
  }
  await trx("confirmation_codes").where({ id: row.id }).update({ consumed_at: trx.fn.now() });
  return row;
};

export const requestEmailChange = async (user: UserRow, newEmail: string): Promise<ConfirmationRequest> => {
  const email = newEmail.trim();
  if (!EMAIL_RE.test(email)) {
    throw invalid("Not a valid email address", [{ field: "newEmail", message: "Not a valid email address" }]);
  }
  if (email.toLowerCase() === user.email.toLowerCase()) {
    throw invalid("That is already your address", [{ field: "newEmail", message: "Same as the current address" }]);
  }
  if (await findUserByEmail(email)) {
    throw conflict("email_taken", "An account with this email already exists");
  }
  return issue(user, "email_change", { newEmail: email }, email, {
    subject: "Confirm your new MailHub email address",
    text: (code) =>
      `Your MailHub confirmation code is ${code}.\n\nEnter it to move your account from ${user.email} to ${email}. The code expires in 10 minutes. If you did not request this, ignore this message.`,
  });
};

export const confirmEmailChange = async (user: UserRow, code: string): Promise<UserRow> => {
  return withTransaction(async (trx) => {
    const row = await consume(user, "email_change", code, trx);
    const newEmail = row.payload.newEmail!;
    let updated: UserRow;
    try {
      [updated] = (await trx<UserRow>("users").where({ id: user.id }).update({ email: newEmail, updated_at: trx.fn.now() }).returning("*")) as [UserRow];
    } catch (error) {
      if (isUniqueViolation(error, "users_email_unique")) {
        throw conflict("email_taken", "An account with this email already exists");
      }
      throw error;
    }
    await recordActivity(trx, {
      action: "account.email_changed",
      objectType: "user",
      objectId: user.id,
      actor: { user: updated },
      details: { from: user.email, to: newEmail },
    });
    return updated;
  });
};

export const requestPasswordChange = async (user: UserRow, newPassword: string): Promise<ConfirmationRequest> => {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw invalid(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const passwordHash = await hashPassword(newPassword);
  return issue(user, "password_change", { passwordHash }, user.email, {
    subject: "Confirm your MailHub password change",
    text: (code) =>
      `Your MailHub confirmation code is ${code}.\n\nEnter it to apply the new password on ${user.email}. The code expires in 10 minutes. If you did not request this, change your password: someone else knows your current one.`,
  });
};

/** Applies the new password and signs out every other session of the account. */
export const confirmPasswordChange = async (user: UserRow, code: string, keepSessionId?: string): Promise<void> => {
  await withTransaction(async (trx) => {
    const row = await consume(user, "password_change", code, trx);
    await trx("users").where({ id: user.id }).update({ password_hash: row.payload.passwordHash!, updated_at: trx.fn.now() });
    const revoke = trx("sessions").where({ user_id: user.id }).whereNull("revoked_at");
    if (keepSessionId) {
      revoke.whereNot({ id: keepSessionId });
    }
    await revoke.update({ revoked_at: trx.fn.now() });
    await recordActivity(trx, {
      action: "account.password_changed",
      objectType: "user",
      objectId: user.id,
      actor: { user },
    });
  });
};

export { revokeSessionsForUsers, db };
