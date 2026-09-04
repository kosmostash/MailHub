import { defineRoute } from "_/api";

import { type EmailPage, listEmails } from "@/domain/emails";

/** The collection view's list (spec §5.4): filters, pagination, pending first. */
export default defineRoute<"collections/[id]/emails", [string]>(({ GET }) => [
  GET<{
    query: {
      state?: "pending" | "ready" | "sent";
      delivery?: "unknown" | "sent" | "delivered" | "bounced";
      page?: VRefine<number, { minimum: 1 }>;
      pageSize?: VRefine<number, { minimum: 1; maximum: 200 }>;
    };
    response: [200, "json", EmailPage];
  }>(async (event) => {
    return listEmails(event.context.auth.actor, event.validated.params.id, event.validated.query);
  }),
]);
