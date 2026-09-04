import { defineRoute } from "_/api";

import { type PublicUser, toPublicUser } from "@/domain/accounts/types";
import { confirmEmailChange } from "@/domain/confirmation";
import { ownAccount } from "~/lib/own-account";

export default defineRoute<"account/email/confirm">(({ POST }) => [
  POST<{
    json: { code: VRefine<string, { minLength: 1; maxLength: 20 }> };
    response: [200, "json", { user: PublicUser }];
  }>(async (event) => {
    const user = await confirmEmailChange(ownAccount(event.context.auth), event.validated.json.code);
    return { user: toPublicUser(user) };
  }),
]);
