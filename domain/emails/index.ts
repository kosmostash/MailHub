import type { Knex } from "knex";

import { db } from "../db";
import { invalid, notFound } from "../errors";
import type { Actor } from "../accounts/types";
import { scopeOf } from "../auth/scope";
import { findVisibleCollection } from "../collections";
import type { Address, DeliveryStatus, EmailRow, EmailSource, EmailState, EmailView } from "./types";
import { toEmailView } from "./types";

export * from "./types";

/** What a client project submits (spec §3.2): addresses as strings or { address, name }. */
export type AddressInput = string | { address: string; name?: string | undefined };

export type SubmissionInput = {
  from: AddressInput;
  to: Array<AddressInput>;
  cc?: Array<AddressInput> | undefined;
  bcc?: Array<AddressInput> | undefined;
  subject?: string | undefined;
  text?: string | undefined;
  html?: string | undefined;
};

/** Deliberately simple: one @, no spaces, something on both sides. Providers do the rest. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeAddress = (input: AddressInput, field: string, errors: Array<{ field: string; message: string }>): Address | undefined => {
  const raw = typeof input === "string" ? { address: input } : input;
  const address = raw?.address?.trim() ?? "";
  if (!EMAIL_RE.test(address)) {
    errors.push({ field, message: `"${address}" is not a valid email address` });
    return undefined;
  }
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  return name ? { address, name } : { address };
};

const normalizeList = (
  list: Array<AddressInput> | undefined,
  field: string,
  errors: Array<{ field: string; message: string }>,
): Array<Address> =>
  (list ?? [])
    .map((entry, i) => normalizeAddress(entry, `${field}[${i}]`, errors))
    .filter((a): a is Address => a !== undefined);

/** Validate and normalize a submission into the stored shape; 422 with per-field details. */
export const normalizeSubmission = (input: SubmissionInput) => {
  const errors: Array<{ field: string; message: string }> = [];
  const from = normalizeAddress(input.from, "from", errors);
  const to = normalizeList(input.to, "to", errors);
  const cc = normalizeList(input.cc, "cc", errors);
  const bcc = normalizeList(input.bcc, "bcc", errors);
  if (!input.to?.length) {
    errors.push({ field: "to", message: "At least one recipient is required" });
  }
  const text = typeof input.text === "string" && input.text.length ? input.text : null;
  const html = typeof input.html === "string" && input.html.length ? input.html : null;
  if (text === null && html === null) {
    errors.push({ field: "body", message: "A text body, an html body, or both is required" });
  }
  if (errors.length) {
    throw invalid("Email is invalid", errors);
  }
  return { from: from!, to, cc, bcc, subject: (input.subject ?? "").trim(), text, html };
};

/** The collection behind a submission credential, with the suspension verdict (spec §3.1). */
export type SubmissionTarget =
  | { status: "unknown" }
  | { status: "operator_disabled" | "admin_disabled"; collection: SubmissionCollection }
  | { status: "ok"; collection: SubmissionCollection };

export type SubmissionCollection = {
  id: string;
  name: string;
  operator_id: string;
  schedule_mode: "after_review" | "immediate";
  provider_id: string | null;
};

export const resolveSubmissionTarget = async (
  collectionId: string | undefined,
  trx: Knex = db(),
): Promise<SubmissionTarget> => {
  if (!collectionId) {
    return { status: "unknown" };
  }
  const row = await trx("collections")
    .join("users as op", "op.id", "collections.operator_id")
    .leftJoin("users as ad", "ad.id", "op.admin_id")
    .where("collections.id", collectionId)
    .first<
      SubmissionCollection & { op_disabled: Date | null; ad_disabled: Date | null }
    >(
      "collections.id",
      "collections.name",
      "collections.operator_id",
      "collections.schedule_mode",
      "collections.provider_id",
      "op.disabled_at as op_disabled",
      "ad.disabled_at as ad_disabled",
    );
  if (!row) {
    return { status: "unknown" };
  }
  const { op_disabled, ad_disabled, ...collection } = row;
  if (ad_disabled) {
    return { status: "admin_disabled", collection };
  }
  if (op_disabled) {
    return { status: "operator_disabled", collection };
  }
  return { status: "ok", collection };
};

/**
 * Store a submission (spec §3.2, §3.6): validated, in the state the collection's schedule
 * mode dictates, durable before the caller answers. Never sends.
 * */
export const storeEmail = async (
  collection: SubmissionCollection,
  input: SubmissionInput,
  source: EmailSource,
  trx: Knex = db(),
): Promise<EmailView> => {
  const normalized = normalizeSubmission(input);
  const [row] = await trx<EmailRow>("emails")
    .insert({
      collection_id: collection.id,
      from_address: normalized.from.address,
      from_name: normalized.from.name ?? null,
      to: JSON.stringify(normalized.to),
      cc: JSON.stringify(normalized.cc),
      bcc: JSON.stringify(normalized.bcc),
      subject: normalized.subject,
      text: normalized.text,
      html: normalized.html,
      state: collection.schedule_mode === "immediate" ? "ready" : "pending",
      source,
    } as never)
    .returning("*");
  return toEmailView(row!);
};

/** Poll (spec §3.3): scoped to the submitting collection, so other collections' ids are 404. */
export const getSubmittedEmail = async (collectionId: string, id: string): Promise<EmailView> => {
  const row = await db()<EmailRow>("emails").where({ id, collection_id: collectionId }).first();
  if (!row) {
    throw notFound("Email");
  }
  return toEmailView(row);
};

export type EmailListFilter = {
  state?: EmailState | undefined;
  delivery?: DeliveryStatus | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

export type EmailPage = {
  emails: Array<EmailView>;
  total: number;
  page: number;
  pageSize: number;
};

/** Collection view (spec §5.4): filterable, paginated, pending first then newest first. */
export const listEmails = async (
  actor: Actor,
  collectionId: string,
  filter: EmailListFilter = {},
): Promise<EmailPage> => {
  const knex = db();
  await findVisibleCollection(actor, collectionId, knex);
  const page = Math.max(filter.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filter.pageSize ?? 25, 1), 200);

  const base = knex<EmailRow>("emails").where({ collection_id: collectionId });
  if (filter.state) {
    base.where("state", filter.state);
  }
  if (filter.delivery) {
    base.where("delivery_status", filter.delivery);
  }
  const [{ count }] = (await base.clone().count("* as count")) as Array<{ count: string }>;
  const rows = await base
    .clone()
    .orderByRaw("(state = 'pending') desc, created_at desc")
    .offset((page - 1) * pageSize)
    .limit(pageSize);

  return { emails: rows.map(toEmailView), total: Number(count), page, pageSize };
};

/** One email in the actor's scope (spec §5.5), or 404. */
export const findVisibleEmail = async (actor: Actor, id: string, trx: Knex = db()): Promise<EmailRow> => {
  const scope = scopeOf(actor.user);
  const query = trx<EmailRow>("emails")
    .join("collections", "collections.id", "emails.collection_id")
    .join("users as op", "op.id", "collections.operator_id")
    .where("emails.id", id)
    .select("emails.*");
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
  const row = await query.first();
  if (!row) {
    throw notFound("Email");
  }
  return row;
};

export const getEmail = async (actor: Actor, id: string): Promise<EmailView> =>
  toEmailView(await findVisibleEmail(actor, id));
