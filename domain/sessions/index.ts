import type { Knex } from "knex";

import { db, withTransaction } from "../db";
import { conflict, forbidden, notFound, unauthenticated } from "../errors";
import { randomToken, sha256 } from "../ids";
import { verifyPassword } from "../passwords";
import { recordActivity } from "../activity";
import type { Actor, UserRow } from "../accounts/types";
import { findUserByEmail, findUserById, isBlocked } from "../accounts/users";

export const SESSION_COOKIE = "mh_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type SessionRow = {
  id: string;
  user_id: string;
  impersonated_user_id: string | null;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
};

/** Everything a request needs to know about who is calling. */
export type AuthContext = {
  session: SessionRow;
  /** who signed in */
  principal: UserRow;
  /** who is acting: the impersonated identity, or the principal */
  actor: Actor;
  impersonating: boolean;
};

export const createSession = async (
  userId: string,
  trx: Knex = db(),
): Promise<{ token: string; session: SessionRow }> => {
  const token = randomToken();
  const [session] = await trx<SessionRow>("sessions")
    .insert({
      id: sha256(token),
      user_id: userId,
      expires_at: new Date(Date.now() + SESSION_TTL_MS),
    })
    .returning("*");
  return { token, session: session! };
};

/** Sign in (spec §5.1). Disabled accounts - and everyone under a disabled admin - are refused. */
export const signIn = async (input: {
  email: string;
  password: string;
}): Promise<{ token: string; user: UserRow }> => {
  const user = await findUserByEmail(input.email);
  if (!user || !(await verifyPassword(user.password_hash, input.password))) {
    throw unauthenticated("Invalid email or password", "invalid_credentials");
  }
  if (await isBlocked(user)) {
    throw unauthenticated("This account is disabled", "account_disabled");
  }
  const { token } = await createSession(user.id);
  return { token, user };
};

/**
 * Turn a cookie token into an AuthContext, or undefined when the session cannot be used.
 * Expired, revoked, disabled (directly or through the admin above) all resolve to nothing;
 * a session whose impersonation target became unusable falls back to the principal.
 * */
export const resolveSession = async (token: string): Promise<AuthContext | undefined> => {
  const knex = db();
  const session = await knex<SessionRow>("sessions").where({ id: sha256(token) }).first();
  if (!session || session.revoked_at || session.expires_at.getTime() < Date.now()) {
    return undefined;
  }

  const principal = await findUserById(session.user_id);
  if (!principal || (await isBlocked(principal))) {
    await knex("sessions").where({ id: session.id }).update({ revoked_at: knex.fn.now() });
    return undefined;
  }

  let actor: Actor = { user: principal };
  let impersonating = false;
  if (session.impersonated_user_id) {
    const target = await findUserById(session.impersonated_user_id);
    if (target && !(await isBlocked(target)) && canImpersonate(principal, target)) {
      actor = { user: target, via: principal };
      impersonating = true;
    } else {
      await knex("sessions").where({ id: session.id }).update({ impersonated_user_id: null });
      session.impersonated_user_id = null;
    }
  }

  if (Date.now() - session.last_seen_at.getTime() > TOUCH_INTERVAL_MS) {
    await knex("sessions").where({ id: session.id }).update({ last_seen_at: knex.fn.now() });
  }

  return { session, principal, actor, impersonating };
};

export const revokeSession = async (sessionId: string, trx: Knex = db()): Promise<void> => {
  await trx("sessions").where({ id: sessionId }).whereNull("revoked_at").update({ revoked_at: trx.fn.now() });
};

/** Disabling bites immediately (spec §6): every live session of these users is revoked. */
export const revokeSessionsForUsers = async (userIds: Array<string>, trx: Knex = db()): Promise<number> => {
  if (!userIds.length) {
    return 0;
  }
  return trx("sessions").whereIn("user_id", userIds).whereNull("revoked_at").update({ revoked_at: trx.fn.now() });
};

/** The §2.2 rules, as a predicate: admins their own operators, the superadmin anyone below. */
export const canImpersonate = (principal: UserRow, target: UserRow): boolean => {
  if (principal.id === target.id) {
    return false;
  }
  switch (principal.role) {
    case "superadmin":
      return target.role !== "superadmin";
    case "admin":
      return target.role === "operator" && target.admin_id === principal.id;
    default:
      return false;
  }
};

export const startImpersonation = async (auth: AuthContext, targetId: string): Promise<UserRow> => {
  if (auth.impersonating) {
    throw conflict("already_impersonating", "End the current impersonation first; it does not nest");
  }
  if (auth.principal.role === "operator") {
    throw forbidden("Operators cannot impersonate");
  }
  return withTransaction(async (trx) => {
    const target = await findUserById(targetId, trx);
    if (!target || !canImpersonate(auth.principal, target)) {
      throw notFound("Account");
    }
    if (await isBlocked(target, trx)) {
      throw conflict("target_disabled", "A disabled account cannot be impersonated");
    }
    await trx("sessions").where({ id: auth.session.id }).update({ impersonated_user_id: target.id });
    await recordActivity(trx, {
      action: "impersonation.started",
      objectType: "user",
      objectId: target.id,
      actor: { user: auth.principal },
      details: { email: target.email, role: target.role },
      adminScopeId: target.role === "admin" ? target.id : target.admin_id,
      operatorScopeId: target.role === "operator" ? target.id : null,
    });
    return target;
  });
};

export const stopImpersonation = async (auth: AuthContext): Promise<void> => {
  if (!auth.impersonating) {
    return;
  }
  const target = auth.actor.user;
  await withTransaction(async (trx) => {
    await trx("sessions").where({ id: auth.session.id }).update({ impersonated_user_id: null });
    await recordActivity(trx, {
      action: "impersonation.ended",
      objectType: "user",
      objectId: target.id,
      actor: { user: auth.principal },
      details: { email: target.email, role: target.role },
      adminScopeId: target.role === "admin" ? target.id : target.admin_id,
      operatorScopeId: target.role === "operator" ? target.id : null,
    });
  });
};
