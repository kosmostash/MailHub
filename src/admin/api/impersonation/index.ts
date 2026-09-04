import { defineRoute } from "_/api";

import { type PublicUser, toPublicUser } from "@/domain/accounts/types";
import { startImpersonation, stopImpersonation } from "@/domain/sessions";

/** Enter and leave impersonation (spec §2.2). One assumed identity at a time. */
export default defineRoute<"impersonation">(({ POST, DELETE }) => [
  POST<{
    json: { userId: VRefine<string, { pattern: "^[0-9a-fA-F-]{36}$" }> };
    response: [200, "json", { actor: PublicUser }];
  }>(async (event) => {
    const target = await startImpersonation(event.context.auth, event.validated.json.userId);
    return { actor: toPublicUser(target) };
  }),

  DELETE<{
    response: [200, "json", { actor: PublicUser }];
  }>(async (event) => {
    await stopImpersonation(event.context.auth);
    return { actor: toPublicUser(event.context.auth.principal) };
  }),
]);
