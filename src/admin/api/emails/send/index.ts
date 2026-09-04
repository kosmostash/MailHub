import { defineRoute } from "_/api";

import { type SendOutcome, sendEmailsExplicitly } from "@/domain/sending";

/** Explicit send, single or bulk (spec §4.2, §5.4, §5.5): a per-id outcome, never aborted. */
export default defineRoute<"emails/send">(({ POST }) => [
  POST<{
    json: { ids: VRefine<Array<string>, { minItems: 1; maxItems: 200 }> };
    response: [200, "json", { outcomes: Array<SendOutcome> }];
  }>(async (event) => {
    return { outcomes: await sendEmailsExplicitly(event.context.auth.actor, event.validated.json.ids) };
  }),
]);
