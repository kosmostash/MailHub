import { defineRoute } from "_/api";

import { enableManagedUser } from "@/domain/accounts/governance";
import { type PublicUser, toPublicUser } from "@/domain/accounts/types";
import { requireRole } from "@/domain/auth/scope";

/** enable (spec §2.1.5, §5.8). */
export default defineRoute<"admins/[id]/enable", [string]>(({ POST, use }) => [
  use(async (event, next) => {
    requireRole(event.context.auth.actor.user, "superadmin");
    return next();
  }),

  POST<{
    response: [200, "json", { user: PublicUser }];
  }>(async (event) => {
    const user = await enableManagedUser(event.context.auth.actor, event.validated.params.id);
    return { user: toPublicUser(user) };
  }),
]);
