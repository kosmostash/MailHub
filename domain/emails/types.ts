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
