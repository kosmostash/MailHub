import { defineRoute } from "_/api";

import { confirmPasswordChange } from "@/domain/confirmation";
import { ownAccount } from "~/lib/own-account";

/** Applies the new password; other sessions of the account are signed out. */
export default defineRoute<"account/password/confirm">(({ POST }) => [
  POST<{
    json: { code: VRefine<string, { minLength: 1; maxLength: 20 }> };
    response: [200, "json", { ok: true }];
  }>(async (event) => {
    await confirmPasswordChange(ownAccount(event.context.auth), event.validated.json.code, event.context.auth.session.id);
    return { ok: true as const };
  }),
]);
