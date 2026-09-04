import { defineRoute } from "_/api";

import { type EmailView, getEmail } from "@/domain/emails";

/** Everything about one email (spec §5.5), for every role in scope. */
export default defineRoute<"emails/[id]", [string]>(({ GET }) => [
  GET<{
    response: [200, "json", { email: EmailView }];
  }>(async (event) => {
    return { email: await getEmail(event.context.auth.actor, event.validated.params.id) };
  }),
]);
