import * as OTPAuth from "otpauth";

import { withTransaction } from "../db";
import { conflict, invalid, unauthenticated } from "../errors";
import { recordActivity } from "../activity";
import type { UserRow } from "../accounts/types";

/** Optional second factor (spec §2.1.7 note): TOTP, enrolled per account. */
const totpFor = (email: string, secret: string) =>
  new OTPAuth.TOTP({ issuer: "MailHub", label: email, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });

export const verifyTotp = (user: UserRow, code: string | undefined): boolean => {
  if (!user.totp_secret || !code) {
    return false;
  }
  return totpFor(user.email, user.totp_secret).validate({ token: code.replace(/\s+/g, ""), window: 1 }) !== null;
};

export const hasTotp = (user: UserRow): boolean => user.totp_enabled_at !== null && user.totp_secret !== null;

/** Generate a secret and store it unarmed; enabling requires one valid code. */
export const startTotpEnrollment = async (user: UserRow): Promise<{ secret: string; uri: string }> => {
  if (hasTotp(user)) {
    throw conflict("totp_enabled", "A second factor is already enabled; disable it first to re-enrol");
  }
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  await withTransaction(async (trx) => {
    await trx("users").where({ id: user.id }).update({ totp_secret: secret, updated_at: trx.fn.now() });
  });
  return { secret, uri: totpFor(user.email, secret).toString() };
};

export const confirmTotpEnrollment = async (user: UserRow, code: string): Promise<void> => {
  if (hasTotp(user)) {
    throw conflict("totp_enabled", "A second factor is already enabled");
  }
  if (!user.totp_secret) {
    throw invalid("Start enrolment first");
  }
  if (!verifyTotp(user, code)) {
    throw unauthenticated("The code is not valid; check the time on your device", "invalid_code");
  }
  await withTransaction(async (trx) => {
    await trx("users").where({ id: user.id }).update({ totp_enabled_at: trx.fn.now(), updated_at: trx.fn.now() });
    await recordActivity(trx, { action: "account.totp_enabled", objectType: "user", objectId: user.id, actor: { user } });
  });
};

export const disableTotp = async (user: UserRow, code: string): Promise<void> => {
  if (!hasTotp(user)) {
    throw conflict("totp_not_enabled", "No second factor is enabled");
  }
  if (!verifyTotp(user, code)) {
    throw unauthenticated("The code is not valid", "invalid_code");
  }
  await withTransaction(async (trx) => {
    await trx("users").where({ id: user.id }).update({ totp_secret: null, totp_enabled_at: null, updated_at: trx.fn.now() });
    await recordActivity(trx, { action: "account.totp_disabled", objectType: "user", objectId: user.id, actor: { user } });
  });
};
