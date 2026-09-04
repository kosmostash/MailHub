import fetchClients from "_/fetch";

export const api = fetchClients;

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

/** The generated fetch client throws an Error carrying the parsed JSON body on non-2xx. */
export const errorCode = (error: unknown): string | undefined =>
  (error as { body?: ErrorBody } | undefined)?.body?.error?.code;

export const errorMessage = (error: unknown): string =>
  (error as { body?: ErrorBody } | undefined)?.body?.error?.message ??
  (error instanceof Error && error.message ? error.message : "Something went wrong");

export const isUnauthenticated = (error: unknown): boolean =>
  (error as { response?: Response } | undefined)?.response?.status === 401;
