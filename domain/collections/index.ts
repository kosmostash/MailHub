import type { Knex } from "knex";

import { db, withTransaction } from "../db";
import { conflict, forbidden, invalid, isUniqueViolation, notFound } from "../errors";
import { collectionId } from "../ids";
import { recordActivity } from "../activity";
import type { Actor } from "../accounts/types";
import { type Scope, scopeOf } from "../auth/scope";

export type ScheduleMode = "after_review" | "immediate";

export type CollectionRow = {
  id: string;
  operator_id: string;
  name: string;
  schedule_mode: ScheduleMode;
  provider_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CollectionCounters = {
  total: number;
  pending: number;
  ready: number;
  sent: number;
  delivered: number;
  bounced: number;
};

export type CollectionView = {
  id: string;
  name: string;
  scheduleMode: ScheduleMode;
  provider: { id: string; name: string; type: string } | null;
  operator: { id: string; email: string; adminId: string };
  counters: CollectionCounters;
  createdAt: string;
  updatedAt: string;
};

type JoinedRow = CollectionRow & {
  operator_email: string;
  admin_id: string;
  provider_name: string | null;
  provider_type: string | null;
};

const emptyCounters = (): CollectionCounters => ({
  total: 0,
  pending: 0,
  ready: 0,
  sent: 0,
  delivered: 0,
  bounced: 0,
});

const toView = (row: JoinedRow, counters: CollectionCounters): CollectionView => ({
  id: row.id,
  name: row.name,
  scheduleMode: row.schedule_mode,
  provider:
    row.provider_id && row.provider_name && row.provider_type
      ? { id: row.provider_id, name: row.provider_name, type: row.provider_type }
      : null,
  operator: { id: row.operator_id, email: row.operator_email, adminId: row.admin_id },
  counters,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

/** Base query joining owner and provider, narrowed to what the scope may see (spec §6). */
const scopedQuery = (scope: Scope, trx: Knex) => {
  const query = trx<JoinedRow>("collections")
    .join("users as op", "op.id", "collections.operator_id")
    .leftJoin("providers", "providers.id", "collections.provider_id")
    .select(
      "collections.*",
      "op.email as operator_email",
      "op.admin_id as admin_id",
      "providers.name as provider_name",
      "providers.type as provider_type",
    );
  switch (scope.kind) {
    case "operator":
      query.where("collections.operator_id", scope.operatorId);
      break;
    case "admin":
      query.where("op.admin_id", scope.adminId);
      break;
    case "all":
      break;
  }
  return query;
};

export const countersFor = async (
  ids: Array<string>,
  trx: Knex = db(),
): Promise<Map<string, CollectionCounters>> => {
  if (!ids.length) {
    return new Map();
  }
  const { rows } = await trx.raw<{
    rows: Array<{ collection_id: string } & Record<keyof CollectionCounters, string>>;
  }>(
    `select collection_id,
            count(*) as total,
            count(*) filter (where state = 'pending') as pending,
            count(*) filter (where state = 'ready') as ready,
            count(*) filter (where state = 'sent') as sent,
            count(*) filter (where delivery_status = 'delivered') as delivered,
            count(*) filter (where delivery_status = 'bounced') as bounced
       from emails where collection_id = any(:ids) group by collection_id`,
    { ids },
  );
  return new Map(
    rows.map((r) => [
      r.collection_id,
      {
        total: Number(r.total),
        pending: Number(r.pending),
        ready: Number(r.ready),
        sent: Number(r.sent),
        delivered: Number(r.delivered),
        bounced: Number(r.bounced),
      },
    ]),
  );
};

/** Collections the actor may see, optionally narrowed further for drill-down views. */
export const listCollections = async (
  actor: Actor,
  filter: { operatorId?: string; adminId?: string } = {},
): Promise<Array<CollectionView>> => {
  const knex = db();
  const query = scopedQuery(scopeOf(actor.user), knex).orderBy([
    { column: "op.email" },
    { column: "collections.name" },
  ]);
  if (filter.operatorId) {
    query.where("collections.operator_id", filter.operatorId);
  }
  if (filter.adminId) {
    query.where("op.admin_id", filter.adminId);
  }
  const rows = await query;
  const counters = await countersFor(
    rows.map((r) => r.id),
    knex,
  );
  return rows.map((row) => toView(row, counters.get(row.id) ?? emptyCounters()));
};

/** One collection in scope, or 404 - out-of-scope ids look exactly like missing ones. */
export const findVisibleCollection = async (
  actor: Actor,
  id: string,
  trx: Knex = db(),
): Promise<JoinedRow> => {
  const row = await scopedQuery(scopeOf(actor.user), trx).where("collections.id", id).first();
  if (!row) {
    throw notFound("Collection");
  }
  return row;
};

export const getCollection = async (actor: Actor, id: string): Promise<CollectionView> => {
  const knex = db();
  const row = await findVisibleCollection(actor, id, knex);
  const counters = await countersFor([row.id], knex);
  return toView(row, counters.get(row.id) ?? emptyCounters());
};

const requireOperator = (actor: Actor): void => {
  if (actor.user.role !== "operator") {
    throw forbidden("Only operators manage collections; impersonate one to act");
  }
};

const assertName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw invalid("Name is required", [{ field: "name", message: "Name is required" }]);
  }
  return trimmed;
};

/** A provider assignable by this operator: one of their admin's (spec §2.4), else 422. */
const assertAssignableProvider = async (actor: Actor, providerId: string, trx: Knex): Promise<void> => {
  const provider = await trx("providers").where({ id: providerId }).first("admin_id");
  if (!provider || provider.admin_id !== actor.user.admin_id) {
    throw invalid("Provider not available to this operator", [
      { field: "providerId", message: "Unknown provider" },
    ]);
  }
};

export const createCollection = async (
  actor: Actor,
  input: { name: string; scheduleMode?: ScheduleMode; providerId?: string | null },
): Promise<CollectionView> => {
  requireOperator(actor);
  const name = assertName(input.name);
  return withTransaction(async (trx) => {
    if (input.providerId) {
      await assertAssignableProvider(actor, input.providerId, trx);
    }
    const id = collectionId();
    try {
      await trx("collections").insert({
        id,
        operator_id: actor.user.id,
        name,
        schedule_mode: input.scheduleMode ?? "after_review",
        provider_id: input.providerId ?? null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict("name_taken", "You already have a collection with this name");
      }
      throw error;
    }
    await recordActivity(trx, {
      action: "collection.created",
      objectType: "collection",
      objectId: id,
      actor,
      details: { name, scheduleMode: input.scheduleMode ?? "after_review", providerId: input.providerId ?? null },
    });
    const row = await findVisibleCollection(actor, id, trx);
    return toView(row, emptyCounters());
  });
};

export const updateCollection = async (
  actor: Actor,
  id: string,
  input: { name?: string; scheduleMode?: ScheduleMode; providerId?: string | null },
): Promise<CollectionView> => {
  requireOperator(actor);
  return withTransaction(async (trx) => {
    await findVisibleCollection(actor, id, trx);
    const patch: Partial<CollectionRow> = {};
    if (input.name !== undefined) {
      patch.name = assertName(input.name);
    }
    if (input.scheduleMode !== undefined) {
      patch.schedule_mode = input.scheduleMode;
    }
    if (input.providerId !== undefined) {
      if (input.providerId) {
        await assertAssignableProvider(actor, input.providerId, trx);
      }
      patch.provider_id = input.providerId;
    }
    if (Object.keys(patch).length) {
      try {
        await trx("collections").where({ id }).update({ ...patch, updated_at: trx.fn.now() });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("name_taken", "You already have a collection with this name");
        }
        throw error;
      }
    }
    await recordActivity(trx, {
      action: "collection.updated",
      objectType: "collection",
      objectId: id,
      actor,
      details: { fields: Object.keys(patch), ...input },
    });
    const row = await findVisibleCollection(actor, id, trx);
    const counters = await countersFor([id], trx);
    return toView(row, counters.get(id) ?? emptyCounters());
  });
};

/** Removes the collection and its emails (FK cascade); confirmed in the UI (spec §5.3). */
export const deleteCollection = async (actor: Actor, id: string): Promise<void> => {
  requireOperator(actor);
  await withTransaction(async (trx) => {
    const row = await findVisibleCollection(actor, id, trx);
    const counters = await countersFor([id], trx);
    await trx("collections").where({ id }).delete();
    await recordActivity(trx, {
      action: "collection.deleted",
      objectType: "collection",
      objectId: id,
      actor,
      details: { name: row.name, emails: counters.get(id)?.total ?? 0 },
    });
  });
};
