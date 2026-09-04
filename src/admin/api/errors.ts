import { HTTPError as H3Error } from "h3";

import { HTTPError, ValidationError } from "@kosmojs/core/errors";

import { errorHandlerFactory } from "_/api:factory";

import { DomainError } from "@/domain/errors";

/**
 * Central error handler (spec §6): every failure is `{ error: { code, message, details? } }`
 * with the status the domain layer chose; validation failures are 422.
 * */
export default errorHandlerFactory(async (wrapped, event) => {
  // H3 wraps whatever a handler throws in its own HTTPError; the domain error is the cause
  const error = wrapped instanceof H3Error && wrapped.cause instanceof DomainError ? wrapped.cause : wrapped;
  const body: { error: { code: string; message: string; details?: unknown } } =
    error instanceof DomainError
      ? error.toBody()
      : error instanceof ValidationError
        ? {
            error: {
              code: "invalid",
              message: `${error.target}: ${error.errorMessage}`,
              details: error.errors,
            },
          }
        : error instanceof HTTPError
          ? { error: { code: codeFor(error.status), message: error.message } }
          : error instanceof H3Error
            ? { error: { code: codeFor(error.status), message: error.message } }
            : { error: { code: "internal", message: "Internal error" } };

  const status =
    error instanceof DomainError
      ? error.status
      : error instanceof ValidationError
        ? 422
        : error instanceof HTTPError || error instanceof H3Error
          ? error.status
          : 500;

  if (status >= 500) {
    console.error(`[admin] ${event.req.method} ${event.url.pathname}:`, error);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
});

const codeFor = (status: number): string => {
  switch (status) {
    case 401:
      return "unauthenticated";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 405:
      return "method_not_allowed";
    case 409:
      return "conflict";
    case 422:
      return "invalid";
    default:
      return status >= 500 ? "internal" : "error";
  }
};
