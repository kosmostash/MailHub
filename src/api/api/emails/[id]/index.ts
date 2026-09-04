import { defineRoute } from "_/api";

import { type EmailView, getSubmittedEmail } from "@/domain/emails";

/** Poll an email (spec §3.3): 404 for unknown ids and for other collections' emails alike. */
export default defineRoute<"emails/[id]", [string]>(({ GET }) => [
  GET<{
    response: [200, "json", EmailView];
  }>(async (ctx) => {
    return ctx.json(await getSubmittedEmail(ctx.get("collection").id, ctx.validated.params.id), 200);
  }),
]);
