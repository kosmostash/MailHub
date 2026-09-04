import { defineRoute } from "_/api";

import { confirmTotpEnrollment } from "@/domain/confirmation";
import { ownAccount } from "~/lib/own-account";

export default defineRoute<"account/totp/confirm">(({ POST }) => [
  POST<{
    json: { code: VRefine<string, { minLength: 1; maxLength: 20 }> };
    response: [200, "json", { ok: true }];
  }>(async (event) => {
    await confirmTotpEnrollment(ownAccount(event.context.auth), event.validated.json.code);
    return { ok: true as const };
  }),
]);
