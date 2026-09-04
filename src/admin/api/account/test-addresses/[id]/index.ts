import { defineRoute } from "_/api";

import { deleteTestAddress } from "@/domain/accounts/test-addresses";

export default defineRoute<"account/test-addresses/[id]", [string]>(({ DELETE }) => [
  DELETE<{
    response: [200, "json", { ok: true }];
  }>(async (event) => {
    await deleteTestAddress(event.context.auth.actor, event.validated.params.id);
    return { ok: true as const };
  }),
]);
