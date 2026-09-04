import type { Knex } from "knex";

import { withTransaction } from "../db";
import { conflict, notFound } from "../errors";
import { recordActivity } from "../activity";
import { revokeSessionsForUsers } from "../sessions";
import type { Actor, UserRow } from "./types";
import { findManagedUser, findUserById } from "./users";

/**
 * Disabling, re-enabling, reassignment and deletion (spec §2.1.5, §2.1.6): one level down
 * in each case. Superadmin → admins, admin → own operators. findManagedUser enforces that
 * and answers 404 for anything else.
 * */

const scopesFor = (actor: Actor, target: UserRow) => ({
  adminScopeId: target.role === "admin" ? target.id : actor.user.id,
  operatorScopeId: target.role === "operator" ? target.id : null,
});

/** Everyone whose sessions die with this account: itself, plus an admin's operators. */
const subtreeIds = async (target: UserRow, trx: Knex): Promise<Array<string>> => {
  if (target.role !== "admin") {
    return [target.id];
  }
  const operators = await trx("users").where({ admin_id: target.id }).select("id");
  return [target.id, ...operators.map((o: { id: string }) => o.id)];
};

export const disableManagedUser = async (actor: Actor, id: string): Promise<UserRow> => {
  return withTransaction(async (trx) => {
    const target = await findManagedUser(actor, id, trx);
    if (target.disabled_at) {
      return target;
    }
    const [updated] = await trx<UserRow>("users")
      .where({ id: target.id })
      .update({ disabled_at: trx.fn.now(), updated_at: trx.fn.now() })
      .returning("*");
    const revoked = await revokeSessionsForUsers(await subtreeIds(target, trx), trx);
    await recordActivity(trx, {
      action: target.role === "admin" ? "admin.disabled" : "operator.disabled",
      objectType: "user",
      objectId: target.id,
      actor,
      details: { email: target.email, sessionsRevoked: revoked },
      ...scopesFor(actor, target),
    });
    return updated!;
  });
};

/**
 * Re-enable lifts the flag on this account only: an operator individually disabled stays
 * disabled when their admin comes back (spec §2.1.5, "does not stack").
 * */
export const enableManagedUser = async (actor: Actor, id: string): Promise<UserRow> => {
  return withTransaction(async (trx) => {
    const target = await findManagedUser(actor, id, trx);
    if (!target.disabled_at) {
      return target;
    }
    const [updated] = await trx<UserRow>("users")
      .where({ id: target.id })
      .update({ disabled_at: null, updated_at: trx.fn.now() })
      .returning("*");
    await recordActivity(trx, {
      action: target.role === "admin" ? "admin.enabled" : "operator.enabled",
      objectType: "user",
      objectId: target.id,
      actor,
      details: { email: target.email },
      ...scopesFor(actor, target),
    });
    return updated!;
  });
};

export type ReassignmentSummary = {
  from: { id: string; email: string };
  to: { id: string; email: string };
  collections: number;
  operators: number;
  providers: number;
  renamedProviders: Array<{ id: string; from: string; to: string }>;
};

/**
 * Move a disabled account's objects to an active one of the same kind (spec §2.1.6).
 * Operators: collections (ids unchanged, emails with them). Admins: operators and
 * providers together, so every collection keeps pointing at a provider of its new admin;
 * provider name collisions are suffixed, never merged.
 * */
export const reassignManagedUser = async (
  actor: Actor,
  sourceId: string,
  targetId: string,
): Promise<ReassignmentSummary> => {
  return withTransaction(async (trx) => {
    const source = await findManagedUser(actor, sourceId, trx);
    if (!source.disabled_at) {
      throw conflict("source_not_disabled", "Only a disabled account's objects can be reassigned; disable it first");
    }
    if (targetId === source.id) {
      throw conflict("same_account", "Pick a different account to reassign to");
    }
    const target = await findManagedUser(actor, targetId, trx);
    if (target.disabled_at) {
      throw conflict("target_disabled", "The receiving account must be active");
    }

    const summary: ReassignmentSummary = {
      from: { id: source.id, email: source.email },
      to: { id: target.id, email: target.email },
      collections: 0,
      operators: 0,
      providers: 0,
      renamedProviders: [],
    };

    if (source.role === "operator") {
      // per-owner unique names: suffix a colliding collection name on arrival
      const incoming = await trx("collections").where({ operator_id: source.id }).select("id", "name");
      const existing = new Set(
        (await trx("collections").where({ operator_id: target.id }).select("name")).map((c: { name: string }) => c.name),
      );
      for (const collection of incoming as Array<{ id: string; name: string }>) {
        let name = collection.name;
        while (existing.has(name)) {
          name = `${collection.name} (from ${source.email})`;
          if (existing.has(name)) {
            name = `${name} ${Math.random().toString(36).slice(2, 6)}`;
          }
        }
        existing.add(name);
        await trx("collections")
          .where({ id: collection.id })
          .update({ operator_id: target.id, name, updated_at: trx.fn.now() });
        summary.collections += 1;
      }
    } else {
      const incoming = await trx("providers").where({ admin_id: source.id }).select("id", "name");
      const existing = new Set(
        (await trx("providers").where({ admin_id: target.id }).select("name")).map((p: { name: string }) => p.name),
      );
      for (const provider of incoming as Array<{ id: string; name: string }>) {
        let name = provider.name;
        while (existing.has(name)) {
          name = `${provider.name} (from ${source.email})`;
          if (existing.has(name)) {
            name = `${name} ${Math.random().toString(36).slice(2, 6)}`;
          }
        }
        existing.add(name);
        if (name !== provider.name) {
          summary.renamedProviders.push({ id: provider.id, from: provider.name, to: name });
        }
        await trx("providers").where({ id: provider.id }).update({ admin_id: target.id, name, updated_at: trx.fn.now() });
        summary.providers += 1;
      }
      summary.operators = await trx("users")
        .where({ admin_id: source.id })
        .update({ admin_id: target.id, updated_at: trx.fn.now() });
    }

    await recordActivity(trx, {
      action: source.role === "admin" ? "admin.reassigned" : "operator.reassigned",
      objectType: "user",
      objectId: source.id,
      actor,
      details: { ...summary },
      ...scopesFor(actor, source),
    });
    return summary;
  });
};

export type Holdings = { collections: number; operators: number; providers: number };

export const holdingsOf = async (user: UserRow, trx: Knex): Promise<Holdings> => {
  const count = async (table: string, where: Record<string, string>) =>
    Number((await trx(table).where(where).count("* as n").first())?.n ?? 0);
  return user.role === "operator"
    ? { collections: await count("collections", { operator_id: user.id }), operators: 0, providers: 0 }
    : {
        collections: 0,
        operators: await count("users", { admin_id: user.id }),
        providers: await count("providers", { admin_id: user.id }),
      };
};

/**
 * Delete (spec §2.1.6): only a disabled account holding nothing. Personal data goes with
 * it (sessions, test addresses); the trail keeps naming it through its snapshots.
 * */
export const deleteManagedUser = async (actor: Actor, id: string): Promise<void> => {
  await withTransaction(async (trx) => {
    const target = await findManagedUser(actor, id, trx);
    if (!target.disabled_at) {
      throw conflict("not_disabled", "Disable the account before deleting it");
    }
    const holdings = await holdingsOf(target, trx);
    if (holdings.collections || holdings.operators || holdings.providers) {
      throw conflict(
        "not_empty",
        target.role === "operator"
          ? `This operator still owns ${holdings.collections} collection(s); reassign them first`
          : `This admin still holds ${holdings.operators} operator(s) and ${holdings.providers} provider(s); reassign them first`,
        holdings,
      );
    }
    await recordActivity(trx, {
      action: target.role === "admin" ? "admin.deleted" : "operator.deleted",
      objectType: "user",
      objectId: target.id,
      actor,
      details: { email: target.email, role: target.role },
      ...scopesFor(actor, target),
    });
    await trx("users").where({ id: target.id }).delete();
  });
};

/** Which managed account may receive a reassignment: active, same kind, same overseer. */
export const reassignmentTargets = async (actor: Actor, sourceId: string, trx: Knex): Promise<Array<UserRow>> => {
  const source = await findManagedUser(actor, sourceId, trx);
  const query = trx<UserRow>("users").where({ role: source.role }).whereNull("disabled_at").whereNot({ id: source.id });
  if (source.role === "operator") {
    query.where({ admin_id: actor.user.id });
  }
  return query.orderBy("email");
};

export { findUserById, notFound };
