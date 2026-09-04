/** An address with an optional display name (spec §2.7). */
export type Address = { address: string; name?: string };

export type EmailState = "pending" | "ready" | "sent";
export type DeliveryStatus = "unknown" | "sent" | "delivered" | "bounced";
export type EmailSource = "http" | "smtp";

export type EmailRow = {
  id: string;
  collection_id: string;
  from_address: string;
  from_name: string | null;
  to: Array<Address>;
  cc: Array<Address>;
  bcc: Array<Address>;
  subject: string;
  text: string | null;
  html: string | null;
  state: EmailState;
  delivery_status: DeliveryStatus;
  attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  source: EmailSource;
  lease_until: Date | null;
  created_at: Date;
  reviewed_at: Date | null;
  sent_at: Date | null;
};

/** What a provider is asked to deliver. */
export type OutgoingMessage = {
  from: Address;
  to: Array<Address>;
  cc: Array<Address>;
  bcc: Array<Address>;
  subject: string;
  text?: string | undefined;
  html?: string | undefined;
};

export const formatAddress = (a: Address): string =>
  a.name ? `"${a.name.replace(/"/g, '\\"')}" <${a.address}>` : a.address;

/** An email as the APIs return it (spec §2.7, §3.2, §3.3, §5.5). */
export type EmailView = {
  id: string;
  collectionId: string;
  from: Address;
  to: Array<Address>;
  cc: Array<Address>;
  bcc: Array<Address>;
  subject: string;
  text: string | null;
  html: string | null;
  state: EmailState;
  deliveryStatus: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  providerMessageId: string | null;
  source: EmailSource;
  createdAt: string;
  reviewedAt: string | null;
  sentAt: string | null;
};

export const toEmailView = (row: EmailRow): EmailView => ({
  id: row.id,
  collectionId: row.collection_id,
  from: row.from_name ? { address: row.from_address, name: row.from_name } : { address: row.from_address },
  to: row.to,
  cc: row.cc,
  bcc: row.bcc,
  subject: row.subject,
  text: row.text,
  html: row.html,
  state: row.state,
  deliveryStatus: row.delivery_status,
  attempts: row.attempts,
  lastError: row.last_error,
  providerMessageId: row.provider_message_id,
  source: row.source,
  createdAt: row.created_at.toISOString(),
  reviewedAt: row.reviewed_at?.toISOString() ?? null,
  sentAt: row.sent_at?.toISOString() ?? null,
});

/** The stored email → what a provider sends. */
export const toOutgoingMessage = (row: EmailRow): OutgoingMessage => ({
  from: row.from_name ? { address: row.from_address, name: row.from_name } : { address: row.from_address },
  to: row.to,
  cc: row.cc,
  bcc: row.bcc,
  subject: row.subject,
  text: row.text ?? undefined,
  html: row.html ?? undefined,
});
