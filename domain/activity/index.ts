import type { Knex } from "knex";

import { db } from "../db";
import type { Actor, Role, UserRow } from "../accounts/types";

/** Closed list of what the trail can say happened (spec §2.6). */
export type ActivityAction =
  | "superadmin.created"
  | "admin.created"
  | "admin.password_reset"
  | "admin.disabled"
  | "admin.enabled"
  | "admin.reassigned"
  | "admin.deleted"
  | "operator.created"
  | "operator.password_reset"
  | "operator.disabled"
  | "operator.enabled"
  | "operator.reassigned"
  | "operator.deleted"
  | "impersonation.started"
  | "impersonation.ended"
  | "collection.created"
  | "collection.updated"
  | "collection.deleted"
  | "provider.created"
  | "provider.updated"
  | "provider.deleted"
  | "email.approved"
  | "email.sent"
  | "email.send_failed"
  | "email.test_sent"
  | "account.email_changed"
  | "account.password_changed"
  | "account.totp_enabled"
  | "account.totp_disabled"
  | "test_address.created"
  | "test_address.deleted";

export type ActivityObjectType =
  | "user"
  | "collection"
  | "provider"
  | "email"
  | "test_address"
  | "session";

export type ActivityRow = {
  id: string;
  at: Date;
  action: ActivityAction;
  object_type: ActivityObjectType;
  object_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: Role | "system";
  via_id: string | null;
  via_email: string | null;
  admin_scope_id: string | null;
  operator_scope_id: string | null;
  details: Record<string, unknown>;
};

export type ActivityEntry = {
  id: string;
  at: string;
  action: ActivityAction;
  objectType: ActivityObjectType;
  objectId: string | null;
  actor: { id: string | null; email: string | null; role: Role | "system" };
  via: { id: string | null; email: string | null } | null;
  details: Record<string, unknown>;
};

export const toActivityEntry = (row: ActivityRow): ActivityEntry => ({
  id: String(row.id),
  at: row.at.toISOString(),
  action: row.action,
  objectType: row.object_type,
  objectId: row.object_id,
  actor: { id: row.actor_id, email: row.actor_email, role: row.actor_role },
  via: row.via_id || row.via_email ? { id: row.via_id, email: row.via_email } : null,
  details: row.details,
});

type RecordInput = {
  action: ActivityAction;
  objectType: ActivityObjectType;
  objectId?: string | null;
  /** the acting identity, or "system" for the background sender */
  actor: Actor | "system";
  details?: Record<string, unknown>;
  /**
   * Which trails this entry belongs to. Defaults follow the actor: an operator's actions
   * land in their own and their admin's trail, an admin's in their own. Pass explicit
   * scopes when the object decides (e.g. the superadmin creating an admin).
   * */
  adminScopeId?: string | null;
  operatorScopeId?: string | null;
};

const defaultScopes = (actor: Actor | "system"): { admin: string | null; operator: string | null } => {
  if (actor === "system") {
    return { admin: null, operator: null };
  }
  const { user } = actor;
  switch (user.role) {
    case "operator":
      return { admin: user.admin_id, operator: user.id };
    case "admin":
      return { admin: user.id, operator: null };
    default:
      return { admin: null, operator: null };
  }
};

/**
 * Append one entry to the trail, inside the caller's transaction so the record and the
 * change it describes commit together. Actor columns are snapshots (spec §2.1.6).
 * */
export const recordActivity = async (trx: Knex, input: RecordInput): Promise<void> => {
  const scopes = defaultScopes(input.actor);
  const user: UserRow | undefined = input.actor === "system" ? undefined : input.actor.user;
  const via: UserRow | undefined = input.actor === "system" ? undefined : input.actor.via;

  await trx("activity").insert({
    action: input.action,
    object_type: input.objectType,
    object_id: input.objectId ?? null,
    actor_id: user?.id ?? null,
    actor_email: user?.email ?? null,
    actor_role: user?.role ?? "system",
    via_id: via?.id ?? null,
    via_email: via?.email ?? null,
    admin_scope_id: input.adminScopeId === undefined ? scopes.admin : input.adminScopeId,
    operator_scope_id: input.operatorScopeId === undefined ? scopes.operator : input.operatorScopeId,
    details: JSON.stringify(input.details ?? {}),
  });
};

export type ActivityFilter = {
  /** restrict to one admin's trail (their own actions and their operators') */
  adminId?: string;
  /** restrict to one operator's trail */
  operatorId?: string;
  /** restrict to entries this actor performed */
  actorId?: string;
  before?: string;
  limit?: number;
};

/** Newest first, keyset-paginated on the bigserial id. */
export const listActivity = async (
  filter: ActivityFilter,
  trx: Knex = db(),
): Promise<{ entries: Array<ActivityEntry>; nextBefore: string | null }> => {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const query = trx<ActivityRow>("activity").orderBy("id", "desc").limit(limit + 1);

  if (filter.adminId) {
    const adminId = filter.adminId;
    query.where((q) => q.where("admin_scope_id", adminId).orWhere("actor_id", adminId));
  }
  if (filter.operatorId) {
    query.where("operator_scope_id", filter.operatorId);
  }
  if (filter.actorId) {
    query.where("actor_id", filter.actorId);
  }
  if (filter.before) {
    query.where("id", "<", filter.before);
  }

  const rows = await query;
  const page = rows.slice(0, limit);
  return {
    entries: page.map(toActivityEntry),
    nextBefore: rows.length > limit ? String(page.at(-1)!.id) : null,
  };
};
