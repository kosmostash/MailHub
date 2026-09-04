import type { Knex } from "knex";

import { db, withTransaction } from "../db";
import { env } from "../env";
import { DomainError, conflict, forbidden, invalid } from "../errors";
import { recordActivity } from "../activity";
import type { Actor } from "../accounts/types";
import { findTestAddress } from "../accounts/test-addresses";
import { type EmailRow, type EmailView, findVisibleEmail, toEmailView, toOutgoingMessage } from "../emails";
import { decryptedConfig, type ProviderRow, ProviderNotImplementedError, sendViaProviderType } from "../providers";

/** How long a claim on a ready email lasts; a crashed worker's batch is retried after this. */
export const LEASE_SECONDS = 60;

export type SendOutcome =
  | { id: string; ok: true; email: EmailView }
  | {
      id: string;
      ok: false;
      code: "not_found" | "not_ready" | "no_provider" | "already_sending" | "provider_error" | "provider_not_implemented";
      message: string;
    };

type Owner = { operator_id: string; admin_id: string; provider: ProviderRow | undefined };

/** The collection's owner (for the trail) and its provider (for the send), if any. */
const ownerOf = async (collectionId: string, trx: Knex): Promise<Owner | undefined> => {
  const row = await trx("collections")
    .join("users as op", "op.id", "collections.operator_id")
    .where("collections.id", collectionId)
    .first<{ operator_id: string; admin_id: string; provider_id: string | null }>(
      "collections.operator_id",
      "op.admin_id",
      "collections.provider_id",
    );
  if (!row) {
    return undefined;
  }
  const provider = row.provider_id
    ? await trx<ProviderRow>("providers").where({ id: row.provider_id }).first()
    : undefined;
  return { operator_id: row.operator_id, admin_id: row.admin_id, provider };
};

const releaseLease = (id: string, trx: Knex) =>
  trx("emails").where({ id }).update({ lease_until: null });

/**
 * Hand one leased, ready email to its provider and record the outcome (spec §4.1):
 * success → sent (sent_at, message id, delivery status); failure → still ready,
 * attempts + 1, last_error. The state guard on the UPDATE makes a double send impossible.
 * */
export const deliver = async (row: EmailRow, actor: Actor | "system"): Promise<SendOutcome> => {
  const knex = db();
  const owner = await ownerOf(row.collection_id, knex);
  if (!owner?.provider) {
    await releaseLease(row.id, knex);
    return { id: row.id, ok: false, code: "no_provider", message: "The collection has no provider assigned" };
  }
  const scopes = { adminScopeId: owner.admin_id, operatorScopeId: owner.operator_id };

  try {
    const result = await sendViaProviderType(
      owner.provider.type,
      decryptedConfig(owner.provider),
      toOutgoingMessage(row),
    );
    return withTransaction(async (trx) => {
      const [updated] = await trx<EmailRow>("emails")
        .where({ id: row.id, state: "ready" })
        .update({
          state: "sent",
          sent_at: trx.fn.now(),
          provider_message_id: result.messageId,
          delivery_status: result.deliveryStatus,
          last_error: null,
          lease_until: null,
        })
        .returning("*");
      await recordActivity(trx, {
        action: "email.sent",
        objectType: "email",
        objectId: row.id,
        actor,
        details: { subject: row.subject, provider: owner.provider!.name, messageId: result.messageId, explicit: actor !== "system" },
        ...scopes,
      });
      return { id: row.id, ok: true, email: toEmailView(updated ?? { ...row, state: "sent" }) };
    });
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    await withTransaction(async (trx) => {
      await trx("emails")
        .where({ id: row.id })
        .update({ attempts: trx.raw("attempts + 1"), last_error: message, lease_until: null });
      await recordActivity(trx, {
        action: "email.send_failed",
        objectType: "email",
        objectId: row.id,
        actor,
        details: { subject: row.subject, provider: owner.provider!.name, error: message, attempt: row.attempts + 1 },
        ...scopes,
      });
    });
    return {
      id: row.id,
      ok: false,
      code: error instanceof ProviderNotImplementedError ? "provider_not_implemented" : "provider_error",
      message,
    };
  }
};

/**
 * The background sender's claim (spec §4.1): oldest ready emails with a provider, under
 * the attempt cap, whose operator and admin are enabled, not already leased. SKIP LOCKED
 * keeps several sender instances from claiming the same row.
 * */
export const claimReadyEmails = async (limit = env.senderBatchSize): Promise<Array<EmailRow>> => {
  const { rows } = await db().raw<{ rows: Array<EmailRow> }>(
    `update emails set lease_until = now() + make_interval(secs => :lease)
      where id in (
        select e.id from emails e
          join collections c on c.id = e.collection_id
          join users op on op.id = c.operator_id
          join users ad on ad.id = op.admin_id
         where e.state = 'ready'
           and c.provider_id is not null
           and e.attempts < :maxAttempts
           and op.disabled_at is null
           and ad.disabled_at is null
           and (e.lease_until is null or e.lease_until < now())
         order by e.created_at
         limit :limit
         for update of e skip locked)
      returning *`,
    { lease: LEASE_SECONDS, maxAttempts: env.senderMaxAttempts, limit },
  );
  return rows;
};

/** One sender pass: claim a batch and deliver it, oldest first. */
export const runSenderBatch = async (limit?: number): Promise<{ claimed: number; sent: number; failed: number }> => {
  const batch = await claimReadyEmails(limit);
  let sent = 0;
  let failed = 0;
  for (const row of batch) {
    const outcome = await deliver(row, "system");
    if (outcome.ok) {
      sent += 1;
    } else {
      failed += 1;
    }
  }
  return { claimed: batch.length, sent, failed };
};

const requireOperator = (actor: Actor): void => {
  if (actor.user.role !== "operator") {
    throw forbidden("Only operators act on emails; impersonate one to act");
  }
};

/** pending → ready (spec §2.7); anything else is a conflict. */
export const approveEmail = async (actor: Actor, id: string): Promise<EmailView> => {
  requireOperator(actor);
  return withTransaction(async (trx) => {
    const row = await findVisibleEmail(actor, id, trx);
    const [updated] = await trx<EmailRow>("emails")
      .where({ id: row.id, state: "pending" })
      .update({ state: "ready", reviewed_at: trx.fn.now() })
      .returning("*");
    if (!updated) {
      throw conflict("not_pending", `Only pending emails can be approved; this one is ${row.state}`);
    }
    await recordActivity(trx, {
      action: "email.approved",
      objectType: "email",
      objectId: row.id,
      actor,
      details: { subject: row.subject },
    });
    return toEmailView(updated);
  });
};

/**
 * Explicit send (spec §4.2): ignores the attempt cap, takes the same lease as the worker,
 * and reports per id. A non-sendable id never aborts the rest.
 * */
export const sendEmailsExplicitly = async (actor: Actor, ids: Array<string>): Promise<Array<SendOutcome>> => {
  requireOperator(actor);
  const knex = db();
  const outcomes: Array<SendOutcome> = [];
  for (const id of [...new Set(ids)]) {
    let row: EmailRow;
    try {
      row = await findVisibleEmail(actor, id, knex);
    } catch (error) {
      outcomes.push({ id, ok: false, code: "not_found", message: error instanceof DomainError ? error.message : "Email not found" });
      continue;
    }
    if (row.state !== "ready") {
      outcomes.push({ id, ok: false, code: "not_ready", message: `Email is ${row.state}, only ready emails can be sent` });
      continue;
    }
    const [leased] = await knex<EmailRow>("emails")
      .where({ id: row.id, state: "ready" })
      .where((q) => q.whereNull("lease_until").orWhere("lease_until", "<", knex.fn.now()))
      .update({ lease_until: knex.raw("now() + make_interval(secs => ?)", [LEASE_SECONDS]) })
      .returning("*");
    if (!leased) {
      outcomes.push({ id, ok: false, code: "already_sending", message: "The background sender is delivering this email right now" });
      continue;
    }
    outcomes.push(await deliver(leased, actor));
  }
  return outcomes;
};

/**
 * Send to me (spec §4.4): a [test]-prefixed copy to one of the operator's test addresses
 * through the collection's provider. The stored email is untouched.
 * */
export const sendToMe = async (actor: Actor, emailId: string, testAddressId: string): Promise<{ sentTo: string }> => {
  requireOperator(actor);
  const knex = db();
  const row = await findVisibleEmail(actor, emailId, knex);
  const target = await findTestAddress(actor, testAddressId, knex);
  const owner = await ownerOf(row.collection_id, knex);
  if (!owner?.provider) {
    throw invalid("The collection has no provider assigned; assign one to test-send", undefined, "no_provider");
  }
  const message = toOutgoingMessage(row);
  try {
    await sendViaProviderType(owner.provider.type, decryptedConfig(owner.provider), {
      ...message,
      to: [{ address: target.address, ...(target.label ? { name: target.label } : {}) }],
      cc: [],
      bcc: [],
      subject: `[test] ${message.subject}`,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new DomainError(502, "provider_error", `The provider rejected the test send: ${detail}`);
  }
  await recordActivity(db(), {
    action: "email.test_sent",
    objectType: "email",
    objectId: row.id,
    actor,
    details: { subject: row.subject, to: target.address, provider: owner.provider.name },
  });
  return { sentTo: target.address };
};

export type DeliveryEvent = {
  emailId?: string | undefined;
  messageId?: string | undefined;
  status: "sent" | "delivered" | "bounced";
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Delivery tracking (spec §3.4, §4.3): correlate on email id or provider message id,
 * update delivery status, count what matched. Unknown ids are counted, never an error.
 * */
export const applyDeliveryEvents = async (events: Array<DeliveryEvent>): Promise<{ matched: number; unmatched: number }> => {
  const knex = db();
  let matched = 0;
  let unmatched = 0;
  for (const event of events) {
    const query = knex("emails");
    if (event.emailId && UUID_RE.test(event.emailId)) {
      query.where({ id: event.emailId });
    } else if (event.messageId) {
      query.where({ provider_message_id: event.messageId });
    } else {
      unmatched += 1;
      continue;
    }
    const updated = await query.update({ delivery_status: event.status });
    if (updated > 0) {
      matched += updated;
    } else {
      unmatched += 1;
    }
  }
  return { matched, unmatched };
};
