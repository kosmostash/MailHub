import { defineRoute } from "_/api";

import { type ConfirmationRequest, requestEmailChange } from "@/domain/confirmation";
import { ownAccount } from "~/lib/own-account";

/** Start an email change (spec §2.1.7): the code goes to the new address. */
export default defineRoute<"account/email">(({ POST }) => [
  POST<{
    json: { newEmail: VRefine<string, { format: "email" }> };
    response: [200, "json", { confirmation: ConfirmationRequest }];
  }>(async (event) => {
    const confirmation = await requestEmailChange(ownAccount(event.context.auth), event.validated.json.newEmail);
    return { confirmation };
  }),
]);
