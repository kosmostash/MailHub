import nodemailer from "nodemailer";

import { invalid } from "../errors";
import type { OutgoingMessage } from "../emails/types";
import { formatAddress } from "../emails/types";

/**
 * Provider types (spec §2.4). A type declares its configuration form, validates a
 * config, and - when implemented - sends. A registered type without `send` fails
 * loudly with provider_not_implemented rather than dropping mail.
 * */
export type ProviderField = {
  key: string;
  label: string;
  type: "text" | "number" | "password" | "boolean";
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  help?: string;
};

export type ProviderTypeInfo = {
  type: string;
  label: string;
  fields: Array<ProviderField>;
  implemented: boolean;
};

export type SendResult = {
  messageId: string | null;
  /** what acceptance by this provider means for delivery status */
  deliveryStatus: "sent";
};

export type ProviderType = {
  type: string;
  label: string;
  fields: Array<ProviderField>;
  /** normalize and validate a config; throws 422 DomainError with field details */
  validate: (config: Record<string, unknown>) => Record<string, unknown>;
  send?: (config: Record<string, unknown>, message: OutgoingMessage) => Promise<SendResult>;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from?: string;
};

const smtp: ProviderType = {
  type: "smtp",
  label: "SMTP",
  fields: [
    { key: "host", label: "Host", type: "text", required: true, placeholder: "smtp.example.com" },
    { key: "port", label: "Port", type: "number", required: true, placeholder: "587" },
    { key: "secure", label: "TLS from the start (SMTPS, usually port 465)", type: "boolean" },
    { key: "user", label: "Username", type: "text" },
    { key: "pass", label: "Password", type: "password", secret: true },
    {
      key: "from",
      label: "From override",
      type: "text",
      placeholder: "MailHub <no-reply@example.com>",
      help: "Sent as the envelope sender instead of each email's own From, when the server requires it",
    },
  ],
  validate(config) {
    const errors: Array<{ field: string; message: string }> = [];
    const host = typeof config.host === "string" ? config.host.trim() : "";
    if (!host) {
      errors.push({ field: "host", message: "Host is required" });
    }
    const port = Number(config.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push({ field: "port", message: "Port must be between 1 and 65535" });
    }
    const secure = config.secure === true || config.secure === "true";
    const user = typeof config.user === "string" && config.user.trim() ? config.user.trim() : undefined;
    const pass = typeof config.pass === "string" && config.pass ? config.pass : undefined;
    const from = typeof config.from === "string" && config.from.trim() ? config.from.trim() : undefined;
    if (pass && !user) {
      errors.push({ field: "user", message: "Username is required when a password is set" });
    }
    if (errors.length) {
      throw invalid("Provider configuration is invalid", errors);
    }
    const normalized: SmtpConfig = { host, port, secure };
    if (user) normalized.user = user;
    if (pass) normalized.pass = pass;
    if (from) normalized.from = from;
    return normalized;
  },
  async send(config, message) {
    const c = config as SmtpConfig;
    const transport = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      ...(c.user ? { auth: { user: c.user, pass: c.pass ?? "" } } : {}),
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      tls: { rejectUnauthorized: c.secure },
    });
    try {
      const info = await transport.sendMail({
        from: c.from ?? formatAddress(message.from),
        ...(c.from ? { replyTo: formatAddress(message.from) } : {}),
        to: message.to.map(formatAddress),
        cc: message.cc.map(formatAddress),
        bcc: message.bcc.map(formatAddress),
        subject: message.subject,
        ...(message.text !== undefined ? { text: message.text } : {}),
        ...(message.html !== undefined ? { html: message.html } : {}),
      });
      return { messageId: info.messageId ?? null, deliveryStatus: "sent" };
    } finally {
      transport.close();
    }
  },
};

const types: ReadonlyMap<string, ProviderType> = new Map([[smtp.type, smtp]]);

export const providerTypes = (): Array<ProviderTypeInfo> =>
  [...types.values()].map(({ type, label, fields, send }) => ({
    type,
    label,
    fields,
    implemented: typeof send === "function",
  }));

export const getProviderType = (type: string): ProviderType | undefined => types.get(type);

export const secretFieldsOf = (type: string): Array<string> =>
  getProviderType(type)?.fields.filter((f) => f.secret).map((f) => f.key) ?? [];

export class ProviderNotImplementedError extends Error {
  constructor(type: string) {
    super(`provider_not_implemented: provider type "${type}" cannot send yet`);
    this.name = "ProviderNotImplementedError";
  }
}

/** Deliver through a provider type; the caller has already decrypted the config. */
export const sendViaProviderType = (
  type: string,
  config: Record<string, unknown>,
  message: OutgoingMessage,
): Promise<SendResult> => {
  const definition = getProviderType(type);
  if (!definition) {
    return Promise.reject(new ProviderNotImplementedError(type));
  }
  if (!definition.send) {
    return Promise.reject(new ProviderNotImplementedError(type));
  }
  return definition.send(config, message);
};
