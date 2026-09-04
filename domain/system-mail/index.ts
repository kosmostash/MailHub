import nodemailer, { type Transporter } from "nodemailer";

import { db } from "../db";
import { env } from "../env";
import { DomainError } from "../errors";

/**
 * System email (spec §2.1.8): what MailHub sends on its own behalf. Never a stored email,
 * never a collection or provider; sent instantly through MAILHUB_SYSTEM_SMTP_URL and
 * recorded in system_emails, which is what rate limiting reads.
 * */
export type SystemEmailPurpose = "email_change" | "password_change";

export const RATE_LIMIT = { window: 15 * 60 * 1000, max: 3 };

let transport: Transporter | undefined;
let transportUrl: string | undefined;

const transporter = (): Transporter | undefined => {
  const url = env.systemSmtpUrl;
  if (!url) {
    return undefined;
  }
  if (!transport || transportUrl !== url) {
    transport = nodemailer.createTransport(url, { tls: { rejectUnauthorized: env.isProduction } });
    transportUrl = url;
  }
  return transport;
};

/** For tests and dev: swap the transport (e.g. to a fake SMTP server). */
export const resetSystemMailTransport = (): void => {
  transport = undefined;
  transportUrl = undefined;
};

export const assertNotRateLimited = async (input: { userId: string; purpose: SystemEmailPurpose; recipient: string }): Promise<void> => {
  const since = new Date(Date.now() - RATE_LIMIT.window);
  const knex = db();
  const [byUser, byRecipient] = await Promise.all([
    knex("system_emails").where({ user_id: input.userId, purpose: input.purpose }).where("created_at", ">", since).count("* as n").first(),
    knex("system_emails").where({ recipient: input.recipient }).where("created_at", ">", since).count("* as n").first(),
  ]);
  if (Number(byUser?.n ?? 0) >= RATE_LIMIT.max || Number(byRecipient?.n ?? 0) >= RATE_LIMIT.max) {
    throw new DomainError(429, "rate_limited", "Too many codes requested; wait a few minutes and try again");
  }
};

export const sendSystemEmail = async (input: {
  to: string;
  subject: string;
  text: string;
  purpose: SystemEmailPurpose;
  userId: string;
}): Promise<void> => {
  await assertNotRateLimited({ userId: input.userId, purpose: input.purpose, recipient: input.to });
  const knex = db();
  const record = (status: "sent" | "failed", error?: string) =>
    knex("system_emails").insert({
      recipient: input.to,
      purpose: input.purpose,
      user_id: input.userId,
      status,
      error: error ?? null,
    });

  const mailer = transporter();
  if (!mailer) {
    if (env.isProduction) {
      await record("failed", "MAILHUB_SYSTEM_SMTP_URL is not configured");
      throw new DomainError(503, "system_mail_unavailable", "System email is not configured on this installation");
    }
    // development convenience: the code lands in the server log
    console.log(`[system-mail] to ${input.to} (${input.purpose}): ${input.text.replace(/\n+/g, " ")}`);
    await record("sent");
    return;
  }
  try {
    await mailer.sendMail({ from: env.systemFrom, to: input.to, subject: input.subject, text: input.text });
    await record("sent");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await record("failed", message.slice(0, 2000));
    throw new DomainError(502, "system_mail_failed", `Could not send the confirmation email: ${message}`);
  }
};
