import { defineRoute } from "_/api";

import { disableTotp, startTotpEnrollment } from "@/domain/confirmation";
import { ownAccount } from "~/lib/own-account";

/** Second factor: start enrolment (POST) or disable with a valid code (DELETE). */
export default defineRoute<"account/totp">(({ POST, DELETE }) => [
  POST<{
    response: [200, "json", { secret: string; uri: string }];
  }>(async (event) => {
    return startTotpEnrollment(ownAccount(event.context.auth));
  }),

  DELETE<{
    json: { code: VRefine<string, { minLength: 1; maxLength: 20 }> };
    response: [200, "json", { ok: true }];
  }>(async (event) => {
    await disableTotp(ownAccount(event.context.auth), event.validated.json.code);
    return { ok: true as const };
  }),
]);
