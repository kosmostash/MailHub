import type { Knex } from "knex";

import { db, withTransaction } from "../db";
import { forbidden, invalid, notFound } from "../errors";
import { recordActivity } from "../activity";
import type { Actor } from "./types";

/** Operator-owned "send to me" targets (spec §2.5): newest first, create and delete. */
export type TestAddressRow = {
  id: string;
  user_id: string;
  address: string;
  label: string | null;
  created_at: Date;
};

export type TestAddressView = {
  id: string;
  address: string;
  label: string | null;
  createdAt: string;
};

const toView = (row: TestAddressRow): TestAddressView => ({
  id: row.id,
  address: row.address,
  label: row.label,
  createdAt: row.created_at.toISOString(),
});

const requireOperator = (actor: Actor): void => {
  if (actor.user.role !== "operator") {
    throw forbidden("Only operators have test addresses; impersonate one to use theirs");
  }
};

export const listTestAddresses = async (actor: Actor, trx: Knex = db()): Promise<Array<TestAddressView>> => {
  requireOperator(actor);
  const rows = await trx<TestAddressRow>("test_addresses")
    .where({ user_id: actor.user.id })
    .orderBy("created_at", "desc");
  return rows.map(toView);
};

export const findTestAddress = async (actor: Actor, id: string, trx: Knex = db()): Promise<TestAddressRow> => {
  requireOperator(actor);
  const row = await trx<TestAddressRow>("test_addresses").where({ id, user_id: actor.user.id }).first();
  if (!row) {
    throw notFound("Test address");
  }
  return row;
};

export const createTestAddress = async (
  actor: Actor,
  input: { address: string; label?: string | null | undefined },
): Promise<TestAddressView> => {
  requireOperator(actor);
  const address = input.address.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw invalid("Not a valid email address", [{ field: "address", message: "Not a valid email address" }]);
  }
  const label = input.label?.trim() || null;
  return withTransaction(async (trx) => {
    const [row] = await trx<TestAddressRow>("test_addresses")
      .insert({ user_id: actor.user.id, address, label })
      .returning("*");
    await recordActivity(trx, {
      action: "test_address.created",
      objectType: "test_address",
      objectId: row!.id,
      actor,
      details: { address, label },
    });
    return toView(row!);
  });
};

export const deleteTestAddress = async (actor: Actor, id: string): Promise<void> => {
  await withTransaction(async (trx) => {
    const row = await findTestAddress(actor, id, trx);
    await trx("test_addresses").where({ id: row.id }).delete();
    await recordActivity(trx, {
      action: "test_address.deleted",
      objectType: "test_address",
      objectId: row.id,
      actor,
      details: { address: row.address },
    });
  });
};
