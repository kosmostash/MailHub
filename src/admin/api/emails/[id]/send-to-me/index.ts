import { defineRoute } from "_/api";

import { sendToMe } from "@/domain/sending";

/** Send to me (spec §4.4): a [test] copy to one of the operator's test addresses. */
export default defineRoute<"emails/[id]/send-to-me", [string]>(({ POST }) => [
  POST<{
    json: { testAddressId: VRefine<string, { minLength: 1 }> };
    response: [200, "json", { ok: true; sentTo: string }];
  }>(async (event) => {
    const { sentTo } = await sendToMe(
      event.context.auth.actor,
      event.validated.params.id,
      event.validated.json.testAddressId,
    );
    return { ok: true as const, sentTo };
  }),
]);
