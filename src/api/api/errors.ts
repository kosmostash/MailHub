import { accepts } from "hono/accepts";
import { HTTPException } from "hono/http-exception";

import { ValidationError, HTTPError } from "@kosmojs/core/errors";

import { errorHandlerFactory } from "_/api:factory";

export default errorHandlerFactory(async (error, ctx) => {
  // Let Hono's HTTPException handle its own response
  if (error instanceof HTTPException) {
    return error.getResponse();
  }

  const [status, message] = Array.isArray(error)
    ? error
    : error instanceof HTTPError
      ? [error.status, error.message]
      : error instanceof ValidationError
        ? [400, `${error.target}: ${error.errorMessage}`]
        : [error.statusCode || 500, error.message];

  // Respond based on what the client accepts
  const type = accepts(ctx, {
    header: "Accept",
    supports: ["application/json", "text/plain"],
    default: "text/plain",
  });

  return type === "application/json"
    ? ctx.json({ error: message }, status)
    : ctx.text(message, status);
});
