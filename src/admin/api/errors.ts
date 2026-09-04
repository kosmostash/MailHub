import { ValidationError } from "@kosmojs/core/errors";
import { HTTPError } from "h3";

import { errorHandlerFactory } from "_/api:factory";

export default errorHandlerFactory(async (error, event) => {
  const [status, message = "Unknown error occurred"] = Array.isArray(error)
    ? error
    : error instanceof HTTPError
      ? [error.status, error.message]
      : error instanceof ValidationError
        ? [400, `${error.target}: ${error.errorMessage}`]
        : [error.statusCode || 500, error.message];

  const accept = event.req.headers.get("accept");

  return accept?.includes("application/json")
    ? new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    : new Response(message, {
        status,
        headers: { "Content-Type": "text/plain" },
      });
});
