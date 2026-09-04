import { defineRoute } from "_/api";

import { type ConfirmationRequest, requestPasswordChange } from "@/domain/confirmation";
import { ownAccount } from "~/lib/own-account";

/** Start a password change (spec §2.1.7): the code goes to the current address. */
export default defineRoute<"account/password">(({ POST }) => [
  POST<{
    json: { newPassword: VRefine<string, { minLength: 8; maxLength: 200 }> };
    response: [200, "json", { confirmation: ConfirmationRequest }];
  }>(async (event) => {
    const confirmation = await requestPasswordChange(ownAccount(event.context.auth), event.validated.json.newPassword);
    return { confirmation };
  }),
]);
