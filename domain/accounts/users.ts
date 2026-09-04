import type { Knex } from "knex";

import { db, withTransaction } from "../db";
import { conflict, forbidden, invalid, isUniqueViolation, notFound } from "../errors";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../passwords";
import { recordActivity } from "../activity";
import { revokeSessionsForUsers } from "../sessions";
import type { Actor, PublicUser, Role, UserRow } from "./types";
import { toPublicUser } from "./types";

export const findUserById = (id: string, trx: Knex = db()): Promise<UserRow | undefined> =>
  trx<UserRow>("users").where({ id }).first();

export const findUserByEmail = (email: string, trx: Knex = db()): Promise<UserRow | undefined> =>
  trx<UserRow>("users").where({ email }).first();

/**
 * True when the account, or the admin above it, is disabled (spec §2.1.5).
 * Disabled state does not stack: an operator's own flag and their admin's are checked separately.
 * */
export const isBlocked = async (user: UserRow, trx: Knex = db()): Promise<boolean> => {
  if (user.disabled_at) {
    return true;
  }
  if (user.role === "operator" && user.admin_id) {
    const admin = await findUserById(user.admin_id, trx);
    return !admin || admin.disabled_at !== null;
  }
  return false;
};

const assertPassword = (password: string): void => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw invalid(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
};

/** Which role may create/manage which (spec §2.1.4): superadmin → admins, admin → own operators. */
const managedRole = (actorRole: Role): Role => {
  switch (actorRole) {
    case "superadmin":
      return "admin";
    case "admin":
      return "operator";
    default:
      throw forbidden("Operators cannot manage accounts");
  }
};

/**
 * Load an account the actor is allowed to manage, or 404 - never 403 - so an admin
 * cannot tell another admin's operator ids from nonexistent ones (spec §6).
 * */
export const findManagedUser = async (
  actor: Actor,
  id: string,
  trx: Knex = db(),
): Promise<UserRow> => {
  const role = managedRole(actor.user.role);
  const user = await findUserById(id, trx);
  if (!user || user.role !== role) {
    throw notFound("Account");
  }
  if (role === "operator" && user.admin_id !== actor.user.id) {
    throw notFound("Account");
  }
  return user;
};

export const createManagedUser = async (
  actor: Actor,
  input: { email: string; password: string },
): Promise<PublicUser> => {
  const role = managedRole(actor.user.role);
  assertPassword(input.password);
  const passwordHash = await hashPassword(input.password);

  return withTransaction(async (trx) => {
    let user: UserRow;
    try {
      [user] = await trx<UserRow>("users")
        .insert({
          role,
          admin_id: role === "operator" ? actor.user.id : null,
          email: input.email,
          password_hash: passwordHash,
        })
        .returning("*");
    } catch (error) {
      if (isUniqueViolation(error, "users_email_unique")) {
        throw conflict("email_taken", "An account with this email already exists");
      }
      throw error;
    }
    await recordActivity(trx, {
      action: role === "admin" ? "admin.created" : "operator.created",
      objectType: "user",
      objectId: user!.id,
      actor,
      details: { email: user!.email },
      adminScopeId: role === "admin" ? user!.id : actor.user.id,
      operatorScopeId: role === "operator" ? user!.id : null,
    });
    return toPublicUser(user!);
  });
};

/** Administrative reset (spec §2.1.1/§2.1.2): no confirmation code, target's sessions revoked. */
export const resetManagedPassword = async (
  actor: Actor,
  id: string,
  password: string,
): Promise<void> => {
  assertPassword(password);
  const passwordHash = await hashPassword(password);
  await withTransaction(async (trx) => {
    const user = await findManagedUser(actor, id, trx);
    await trx("users")
      .where({ id: user.id })
      .update({ password_hash: passwordHash, updated_at: trx.fn.now() });
    await revokeSessionsForUsers([user.id], trx);
    await recordActivity(trx, {
      action: user.role === "admin" ? "admin.password_reset" : "operator.password_reset",
      objectType: "user",
      objectId: user.id,
      actor,
      details: { email: user.email },
      adminScopeId: user.role === "admin" ? user.id : actor.user.id,
      operatorScopeId: user.role === "operator" ? user.id : null,
    });
  });
};

export type AccountSummary = PublicUser & {
  operators: number;
  providers: number;
  collections: number;
  pending: number;
  lastActivityAt: string | null;
};

/** Per-account summary rows for the Admins and Operators pages (spec §5.7, §5.8). */
export const listManagedUsers = async (actor: Actor): Promise<Array<AccountSummary>> => {
  const role = managedRole(actor.user.role);
  const knex = db();

  const query = knex<UserRow>("users").where({ role }).orderBy("created_at", "asc");
  if (role === "operator") {
    query.where({ admin_id: actor.user.id });
  }
  const users: Array<UserRow> = await query;

  if (!users.length) {
    return [];
  }
  const ids = users.map((u) => u.id);

  // the column that groups collections/emails under an account: the operator for
  // operator summaries, the operator's admin for admin summaries
  const owner = role === "admin" ? "users.admin_id" : "users.id";

  type CountRow = { id: string; count: string };
  const countBy = async (sql: string): Promise<Map<string, number>> => {
    const { rows } = await knex.raw<{ rows: Array<CountRow> }>(sql, { ids });
    return new Map(rows.map((row) => [row.id, Number(row.count)]));
  };

  const [operators, providers, collections, pending, activity] = await Promise.all([
    role === "admin"
      ? countBy("select admin_id as id, count(*) from users where admin_id = any(:ids) group by admin_id")
      : new Map<string, number>(),
    role === "admin"
      ? countBy("select admin_id as id, count(*) from providers where admin_id = any(:ids) group by admin_id")
      : new Map<string, number>(),
    countBy(
      `select ${owner} as id, count(*) from collections
         join users on users.id = collections.operator_id
        where ${owner} = any(:ids) group by ${owner}`,
    ),
    countBy(
      `select ${owner} as id, count(*) from emails
         join collections on collections.id = emails.collection_id
         join users on users.id = collections.operator_id
        where emails.state = 'pending' and ${owner} = any(:ids) group by ${owner}`,
    ),
    knex
      .raw<{ rows: Array<{ id: string; at: Date }> }>(
        "select actor_id as id, max(at) as at from activity where actor_id = any(:ids) group by actor_id",
        { ids },
      )
      .then(({ rows }) => new Map(rows.map((row) => [row.id, row.at]))),
  ]);

  return users.map((user) => ({
    ...toPublicUser(user),
    operators: operators.get(user.id) ?? 0,
    providers: providers.get(user.id) ?? 0,
    collections: collections.get(user.id) ?? 0,
    pending: pending.get(user.id) ?? 0,
    lastActivityAt: activity.get(user.id)?.toISOString() ?? null,
  }));
};
