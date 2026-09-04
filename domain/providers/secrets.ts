import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "../env";

/**
 * Provider credentials at rest: AES-256-GCM under a key derived from MAILHUB_SECRET.
 * Stored as "enc:v1:<base64url iv|tag|ciphertext>" so plain values are recognizable.
 * */
const PREFIX = "enc:v1:";

const key = (): Buffer => createHash("sha256").update(env.secret).digest();

export const isEncrypted = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith(PREFIX);

export const encryptSecret = (plain: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64url");
};

export const decryptSecret = (value: string): string => {
  if (!isEncrypted(value)) {
    return value;
  }
  const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};
