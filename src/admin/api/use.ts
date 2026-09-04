import { use } from "_/api";

import { unauthenticated } from "@/domain/errors";
import { resolveSession } from "@/domain/sessions";
import { clearSessionCookie, readSessionCookie } from "~/lib/session-cookie";

/**
 * Global middleware: every admin API route requires a live session (spec §5.1).
 * Routes that must work without one override the "auth" slot.
 * */
export default [
  use(
    async function requireSession(event, next) {
      const token = readSessionCookie(event);
      const auth = token ? await resolveSession(token) : undefined;
      if (!auth) {
        if (token) {
          clearSessionCookie(event);
        }
        throw unauthenticated();
      }
      event.context.auth = auth;
      return next();
    },
    { slot: "auth" },
  ),
];
