import { defineRoute } from "_/api";

import type { PublicUser } from "@/domain/accounts/types";
import { type AccountSummary, createManagedUser, listManagedUsers } from "@/domain/accounts/users";
import { requireRole } from "@/domain/auth/scope";

/** Admins management (spec §5.8), in the superadmin's own identity. */
export default defineRoute<"admins">(({ GET, POST, use }) => [
  use(async (event, next) => {
    requireRole(event.context.auth.actor.user, "superadmin");
    return next();
  }),

  GET<{
    response: [200, "json", { admins: Array<AccountSummary> }];
  }>(async (event) => {
    return { admins: await listManagedUsers(event.context.auth.actor) };
  }),

  POST<{
    json: {
      email: VRefine<string, { format: "email" }>;
      password: VRefine<string, { minLength: 8; maxLength: 200 }>;
    };
    response: [201, "json", { user: PublicUser }];
  }>(async (event) => {
    const user = await createManagedUser(event.context.auth.actor, event.validated.json);
    event.res.status = 201;
    return { user };
  }),
]);
