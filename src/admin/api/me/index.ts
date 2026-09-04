import { defineRoute } from "_/api";

import { type PublicUser, toPublicUser } from "@/domain/accounts/types";

export type Me = {
  /** who signed in */
  principal: PublicUser;
  /** who is acting - the impersonated identity, or the principal */
  actor: PublicUser;
  impersonating: boolean;
};

/** What the UI builds its navigation and impersonation banner from (spec §2.2, §5). */
export default defineRoute<"me">(({ GET }) => [
  GET<{
    response: [200, "json", Me];
  }>(async (event) => {
    const { principal, actor, impersonating } = event.context.auth;
    return {
      principal: toPublicUser(principal),
      actor: toPublicUser(actor.user),
      impersonating,
    };
  }),
]);
