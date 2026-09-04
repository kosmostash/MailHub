import { defineRoute } from "_/api";

import { resetManagedPassword } from "@/domain/accounts/users";
import { requireRole } from "@/domain/auth/scope";

/** Administrative password reset (spec §5.7): the recovery path, no confirmation code. */
export default defineRoute<"operators/[id]/password", [string]>(({ POST, use }) => [
  use(async (event, next) => {
    requireRole(event.context.auth.actor.user, "admin");
    return next();
  }),

  POST<{
    json: { password: VRefine<string, { minLength: 8; maxLength: 200 }> };
    response: [200, "json", { ok: true }];
  }>(async (event) => {
    await resetManagedPassword(
      event.context.auth.actor,
      event.validated.params.id,
      event.validated.json.password,
    );
    return { ok: true as const };
  }),
]);
