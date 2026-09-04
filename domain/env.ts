/**
 * Process configuration. Every setting MailHub reads from the environment is declared here,
 * so `.env.example` and this file are the two places that must agree.
 *
 * A `.env` file next to package.json is loaded when present (Node's built-in loader);
 * real environment variables always win over it.
 * */
try {
  process.loadEnvFile();
} catch {
  // no .env file - fine, the environment is the source of truth
}

const read = (name: string): string | undefined => {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
};

const required = (name: string): string => {
  const value = read(name);
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
};

const integer = (name: string, fallback: number): number => {
  const value = read(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${value}"`);
  }
  return parsed;
};

export const env = {
  nodeEnv: read("NODE_ENV") ?? "development",
  get isProduction() {
    return this.nodeEnv === "production";
  },
  get isTest() {
    return this.nodeEnv === "test";
  },

  /** Postgres connection string, e.g. postgres://user:pass@host:5432/mailhub */
  get databaseUrl() {
    return required("DATABASE_URL");
  },

  /** 32+ random bytes (any encoding); derives session and provider-config encryption keys */
  get secret() {
    return required("MAILHUB_SECRET");
  },

  /** Where the web application is reachable by users, used in system emails */
  publicUrl: read("MAILHUB_PUBLIC_URL") ?? "http://localhost:4556",

  /** Nodemailer transport URL for system email (spec §2.1.8), e.g. smtp://user:pass@host:587 */
  systemSmtpUrl: read("MAILHUB_SYSTEM_SMTP_URL"),
  systemFrom: read("MAILHUB_SYSTEM_FROM") ?? "MailHub <mailhub@localhost>",

  /** SMTP ingestion listener (spec §3.6) */
  smtpHost: read("MAILHUB_SMTP_HOST") ?? "0.0.0.0",
  smtpPort: integer("MAILHUB_SMTP_PORT", 2525),
  smtpMaxMessageBytes: integer("MAILHUB_SMTP_MAX_MESSAGE_BYTES", 25 * 1024 * 1024),

  /** Background sender (spec §4.1) */
  senderIntervalMs: integer("MAILHUB_SENDER_INTERVAL_MS", 2000),
  senderBatchSize: integer("MAILHUB_SENDER_BATCH_SIZE", 20),
  senderMaxAttempts: 3,
};
