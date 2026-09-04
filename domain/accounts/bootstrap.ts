import { db, withTransaction } from "../db";
import { conflict, invalid, isUniqueViolation } from "../errors";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../passwords";
import { recordActivity } from "../activity";
import type { UserRow } from "./types";

export const superadminExists = async (): Promise<boolean> => {
  const row = await db()("users").where({ role: "superadmin" }).first("id");
  return row !== undefined;
};

/**
 * First-run bootstrap (spec §2.1.4). The partial unique index on users(role) makes the
 * "at most one superadmin" rule hold even for two concurrent first requests.
 * */
export const createSuperadmin = async (input: {
  email: string;
  password: string;
}): Promise<UserRow> => {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw invalid(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const passwordHash = await hashPassword(input.password);

  return withTransaction(async (trx) => {
    let user: UserRow;
    try {
      [user] = await trx<UserRow>("users")
        .insert({ role: "superadmin", admin_id: null, email: input.email, password_hash: passwordHash })
        .returning("*");
    } catch (error) {
      if (isUniqueViolation(error, "users_single_superadmin")) {
        throw conflict("superadmin_exists", "A superadmin already exists");
      }
      if (isUniqueViolation(error, "users_email_unique")) {
        throw conflict("email_taken", "An account with this email already exists");
      }
      throw error;
    }
    await recordActivity(trx, {
      action: "superadmin.created",
      objectType: "user",
      objectId: user!.id,
      actor: { user: user! },
      details: { email: user!.email },
    });
    return user!;
  });
};
