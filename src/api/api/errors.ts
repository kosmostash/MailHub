import { HTTPException } from "hono/http-exception";

import { HTTPError, ValidationError } from "@kosmojs/core/errors";

import { errorHandlerFactory } from "_/api:factory";

import { DomainError } from "@/domain/errors";

/** Structured JSON errors on every failure (spec §6): `{ error: { code, message, details? } }`. */
export default errorHandlerFactory(async (error, ctx) => {
  if (error instanceof DomainError) {
    return ctx.json(error.toBody(), error.status as 400);
  }
  if (error instanceof ValidationError) {
    return ctx.json(
      { error: { code: "invalid", message: `${error.target}: ${error.errorMessage}`, details: error.errors } },
      422,
    );
  }
  if (error instanceof HTTPError) {
    return ctx.json({ error: { code: "error", message: error.message } }, error.status as 400);
  }
  if (error instanceof HTTPException) {
    return ctx.json({ error: { code: "error", message: error.message } }, error.status);
  }
  console.error(`[api] ${ctx.req.method} ${ctx.req.path}:`, error);
  return ctx.json({ error: { code: "internal", message: "Internal error" } }, 500);
});
