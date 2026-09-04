import { defineRoute } from "_/api";

import { reassignManagedUser, reassignmentTargets, type ReassignmentSummary } from "@/domain/accounts/governance";
import { type PublicUser, toPublicUser } from "@/domain/accounts/types";
import { requireRole } from "@/domain/auth/scope";
import { db } from "@/domain/db";

/** Reassign a disabled account's objects to an active one (spec §2.1.6, §5.8). */
export default defineRoute<"admins/[id]/reassign", [string]>(({ GET, POST, use }) => [
  use(async (event, next) => {
    requireRole(event.context.auth.actor.user, "superadmin");
    return next();
  }),

  /** the accounts that may receive this one's objects */
  GET<{
    response: [200, "json", { targets: Array<PublicUser> }];
  }>(async (event) => {
    const rows = await reassignmentTargets(event.context.auth.actor, event.validated.params.id, db());
    return { targets: rows.map(toPublicUser) };
  }),

  POST<{
    json: { targetId: VRefine<string, { minLength: 1 }> };
    response: [200, "json", { summary: ReassignmentSummary }];
  }>(async (event) => {
    return {
      summary: await reassignManagedUser(
        event.context.auth.actor,
        event.validated.params.id,
        event.validated.json.targetId,
      ),
    };
  }),
]);
