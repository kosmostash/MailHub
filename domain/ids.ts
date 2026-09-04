import { createHash, randomBytes, randomInt } from "node:crypto";

/** URL-safe random token; 32 bytes → 43 chars */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

/** Collection id doubles as the API key (spec §2.3): 24 random bytes → 32 url-safe chars */
export const collectionId = (): string => randomBytes(24).toString("base64url");

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Six-digit confirmation code, zero-padded */
export const confirmationCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");
