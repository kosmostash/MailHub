import { defineRoute } from "_/api";

import type { EmailView } from "@/domain/emails";
import { approveEmail } from "@/domain/sending";

/** Approve (spec §5.5): pending → ready. Operator or impersonation only. */
export default defineRoute<"emails/[id]/approve", [string]>(({ POST }) => [
  POST<{
    response: [200, "json", { email: EmailView }];
  }>(async (event) => {
    return { email: await approveEmail(event.context.auth.actor, event.validated.params.id) };
  }),
]);
