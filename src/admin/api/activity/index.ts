import { defineRoute } from "_/api";

import type { ActivityEntry } from "@/domain/activity";
import { listActivityFor } from "@/domain/activity/views";

/** The activity trail (spec §2.6, §5.9): newest first, keyset-paginated, scoped by role. */
export default defineRoute<"activity">(({ GET }) => [
  GET<{
    query: {
      adminId?: string;
      operatorId?: string;
      before?: string;
      limit?: VRefine<number, { minimum: 1; maximum: 200 }>;
    };
    response: [200, "json", { entries: Array<ActivityEntry>; nextBefore: string | null }];
  }>(async (event) => {
    return listActivityFor(event.context.auth.actor, event.validated.query);
  }),
]);
