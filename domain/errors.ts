/**
 * Errors the domain layer throws. Framework-free: each folder's api/errors.ts maps them
 * to the HTTP status table in spec §6 and to the `{ error: { code, message, details } }` body.
 * */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export const unauthenticated = (message = "Sign in required", code = "unauthenticated") =>
  new DomainError(401, code, message);

export const forbidden = (message = "Not allowed for this role", code = "forbidden") =>
  new DomainError(403, code, message);

export const notFound = (what: string, code = "not_found") =>
  new DomainError(404, code, `${what} not found`);

export const conflict = (code: string, message: string, details?: unknown) =>
  new DomainError(409, code, message, details);

export const invalid = (message: string, details?: unknown, code = "invalid") =>
  new DomainError(422, code, message, details);

/** Postgres unique_violation, surfaced by the pg driver */
export const isUniqueViolation = (error: unknown, constraint?: string): boolean => {
  const e = error as { code?: string; constraint?: string } | undefined;
  return e?.code === "23505" && (constraint === undefined || e.constraint === constraint);
};
