import { defineRoute } from "_/api";

import { deleteManagedUser } from "@/domain/accounts/governance";
import { requireRole } from "@/domain/auth/scope";

/** Delete (spec §5.7): only once disabled and holding nothing, else 409. */
export default defineRoute<"operators/[id]", [string]>(({ DELETE, use }) => [
  use(async (event, next) => {
    requireRole(event.context.auth.actor.user, "admin");
    return next();
  }),

  DELETE<{
    response: [200, "json", { ok: true }];
  }>(async (event) => {
    await deleteManagedUser(event.context.auth.actor, event.validated.params.id);
    return { ok: true as const };
  }),
]);
