import { defineRoute } from "_/api";

import type { PublicUser } from "@/domain/accounts/types";
import { type AccountSummary, createManagedUser, listManagedUsers } from "@/domain/accounts/users";
import { requireRole } from "@/domain/auth/scope";

/** Operators management (spec §5.7), in the admin's own identity. */
export default defineRoute<"operators">(({ GET, POST, use }) => [
  use(async (event, next) => {
    requireRole(event.context.auth.actor.user, "admin");
    return next();
  }),

  GET<{
    response: [200, "json", { operators: Array<AccountSummary> }];
  }>(async (event) => {
    return { operators: await listManagedUsers(event.context.auth.actor) };
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
