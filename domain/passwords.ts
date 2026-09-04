import { hash, verify } from "@node-rs/argon2";

export const MIN_PASSWORD_LENGTH = 8;

/** argon2id is @node-rs/argon2's default algorithm; the library's defaults follow OWASP guidance. */
export const hashPassword = (password: string): Promise<string> => hash(password);

export const verifyPassword = async (passwordHash: string, password: string): Promise<boolean> => {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
};
