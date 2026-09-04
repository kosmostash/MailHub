import type { Knex } from "knex";

import { db, withTransaction } from "../db";
import { conflict, forbidden, invalid, isUniqueViolation, notFound } from "../errors";
import { recordActivity } from "../activity";
import type { Actor } from "../accounts/types";
import { getProviderType, secretFieldsOf } from "./registry";
import { decryptSecret, encryptSecret, isEncrypted } from "./secrets";

export { providerTypes, sendViaProviderType, ProviderNotImplementedError } from "./registry";
export type { ProviderTypeInfo, ProviderField } from "./registry";

export const SECRET_MASK = "••••••••";

export type ProviderRow = {
  id: string;
  admin_id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

/** A provider as the API returns it: secrets masked, or no config at all for operators. */
export type ProviderView = {
  id: string;
  adminId: string;
  name: string;
  type: string;
  config: Record<string, unknown> | null;
  collections: number;
  createdAt: string;
  updatedAt: string;
};

const maskConfig = (row: ProviderRow): Record<string, unknown> => {
  const secrets = new Set(secretFieldsOf(row.type));
  return Object.fromEntries(
    Object.entries(row.config).map(([k, v]) => [k, secrets.has(k) && v ? SECRET_MASK : v]),
  );
};

/** The config as the delivery code needs it: secrets decrypted. Never leaves the process. */
export const decryptedConfig = (row: ProviderRow): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(row.config).map(([k, v]) => [k, isEncrypted(v) ? decryptSecret(v) : v]),
  );

const encryptConfig = (type: string, config: Record<string, unknown>): Record<string, unknown> => {
  const secrets = new Set(secretFieldsOf(type));
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => [
      k,
      secrets.has(k) && typeof v === "string" && v && !isEncrypted(v) ? encryptSecret(v) : v,
    ]),
  );
};

const toView = (row: ProviderRow, collections: number, withConfig: boolean): ProviderView => ({
  id: row.id,
  adminId: row.admin_id,
  name: row.name,
  type: row.type,
  config: withConfig ? maskConfig(row) : null,
  collections,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

/** Which admin's providers the actor may see: their own, their admin's, or (superadmin) all. */
const visibleAdminId = (actor: Actor): string | null => {
  switch (actor.user.role) {
    case "admin":
      return actor.user.id;
    case "operator":
      return actor.user.admin_id;
    default:
      return null;
  }
};

const usageCounts = async (ids: Array<string>, trx: Knex): Promise<Map<string, number>> => {
  if (!ids.length) {
    return new Map();
  }
  const { rows } = await trx.raw<{ rows: Array<{ provider_id: string; count: string }> }>(
    "select provider_id, count(*) from collections where provider_id = any(:ids) group by provider_id",
    { ids },
  );
  return new Map(rows.map((r) => [r.provider_id, Number(r.count)]));
};

/**
 * Operators get name and type only (spec §2.4 availability); admins their own with
 * masked configs; the superadmin every admin's, masked, optionally filtered by admin.
 * */
export const listProviders = async (
  actor: Actor,
  filter: { adminId?: string } = {},
): Promise<Array<ProviderView>> => {
  const knex = db();
  const adminId = visibleAdminId(actor) ?? filter.adminId;
  const query = knex<ProviderRow>("providers").orderBy("name", "asc");
  if (adminId) {
    query.where({ admin_id: adminId });
  }
  const rows = await query;
  const counts = await usageCounts(
    rows.map((r) => r.id),
    knex,
  );
  const withConfig = actor.user.role !== "operator";
  return rows.map((row) => toView(row, counts.get(row.id) ?? 0, withConfig));
};

/** A provider the actor may see, or 404 (never 403) when out of scope. */
export const findVisibleProvider = async (
  actor: Actor,
  id: string,
  trx: Knex = db(),
): Promise<ProviderRow> => {
  const row = await trx<ProviderRow>("providers").where({ id }).first();
  const adminId = visibleAdminId(actor);
  if (!row || (adminId && row.admin_id !== adminId)) {
    throw notFound("Provider");
  }
  return row;
};

export const getProvider = async (actor: Actor, id: string): Promise<ProviderView> => {
  const knex = db();
  const row = await findVisibleProvider(actor, id, knex);
  const counts = await usageCounts([row.id], knex);
  return toView(row, counts.get(row.id) ?? 0, actor.user.role !== "operator");
};

const requireAdmin = (actor: Actor): void => {
  if (actor.user.role !== "admin") {
    throw forbidden("Only admins manage providers");
  }
};

const validateConfig = (type: string, config: Record<string, unknown>): Record<string, unknown> => {
  const definition = getProviderType(type);
  if (!definition) {
    throw invalid(`Unknown provider type "${type}"`, [{ field: "type", message: "Unknown type" }]);
  }
  return definition.validate(config);
};

export const createProvider = async (
  actor: Actor,
  input: { name: string; type: string; config: Record<string, unknown> },
): Promise<ProviderView> => {
  requireAdmin(actor);
  const name = input.name.trim();
  if (!name) {
    throw invalid("Name is required", [{ field: "name", message: "Name is required" }]);
  }
  const config = encryptConfig(input.type, validateConfig(input.type, input.config));

  return withTransaction(async (trx) => {
    let row: ProviderRow;
    try {
      [row] = await trx<ProviderRow>("providers")
        .insert({ admin_id: actor.user.id, name, type: input.type, config })
        .returning("*");
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict("name_taken", "You already have a provider with this name");
      }
      throw error;
    }
    await recordActivity(trx, {
      action: "provider.created",
      objectType: "provider",
      objectId: row!.id,
      actor,
      details: { name, type: input.type },
    });
    return toView(row!, 0, true);
  });
};

export const updateProvider = async (
  actor: Actor,
  id: string,
  input: { name?: string; config?: Record<string, unknown> },
): Promise<ProviderView> => {
  requireAdmin(actor);
  return withTransaction(async (trx) => {
    const current = await findVisibleProvider(actor, id, trx);
    const patch: Partial<Pick<ProviderRow, "name" | "config">> = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw invalid("Name is required", [{ field: "name", message: "Name is required" }]);
      }
      patch.name = name;
    }
    if (input.config !== undefined) {
      // a masked secret sent back means "keep what is stored"
      const secrets = new Set(secretFieldsOf(current.type));
      const merged = Object.fromEntries(
        Object.entries(input.config).map(([k, v]) => [
          k,
          secrets.has(k) && v === SECRET_MASK ? decryptedConfig(current)[k] : v,
        ]),
      );
      patch.config = encryptConfig(current.type, validateConfig(current.type, merged));
    }

    let row = current;
    if (Object.keys(patch).length) {
      try {
        [row] = (await trx<ProviderRow>("providers")
          .where({ id })
          .update({ ...patch, updated_at: trx.fn.now() })
          .returning("*")) as [ProviderRow];
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("name_taken", "You already have a provider with this name");
        }
        throw error;
      }
    }
    await recordActivity(trx, {
      action: "provider.updated",
      objectType: "provider",
      objectId: row.id,
      actor,
      details: { name: row.name, fields: Object.keys(patch) },
    });
    const counts = await usageCounts([row.id], trx);
    return toView(row, counts.get(row.id) ?? 0, true);
  });
};

/** Refused with 409 while any collection still sends through it (spec §2.4). */
export const deleteProvider = async (actor: Actor, id: string): Promise<void> => {
  requireAdmin(actor);
  await withTransaction(async (trx) => {
    const row = await findVisibleProvider(actor, id, trx);
    const used = await trx("collections").where({ provider_id: row.id }).count("* as count").first();
    const count = Number(used?.count ?? 0);
    if (count > 0) {
      throw conflict(
        "provider_in_use",
        `This provider is assigned to ${count} collection${count === 1 ? "" : "s"}; reassign them first`,
        { collections: count },
      );
    }
    await trx("providers").where({ id: row.id }).delete();
    await recordActivity(trx, {
      action: "provider.deleted",
      objectType: "provider",
      objectId: row.id,
      actor,
      details: { name: row.name, type: row.type },
    });
  });
};
