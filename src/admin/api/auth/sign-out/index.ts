import { defineRoute } from "_/api";

import { resolveSession, revokeSession } from "@/domain/sessions";
import { clearSessionCookie, readSessionCookie } from "~/lib/session-cookie";

/** Sign out: revoke the session row and drop the cookie. Works even with a stale cookie. */
export default defineRoute<"auth/sign-out">(({ POST, use }) => [
  use(async (_event, next) => next(), { slot: "auth" }),

  POST<{
    response: [200, "json", { ok: true }];
  }>(async (event) => {
    const token = readSessionCookie(event);
    const auth = token ? await resolveSession(token) : undefined;
    if (auth) {
      await revokeSession(auth.session.id);
    }
    clearSessionCookie(event);
    return { ok: true as const };
  }),
]);
