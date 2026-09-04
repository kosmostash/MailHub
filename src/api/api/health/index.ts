import { defineRoute } from "_/api";

import { pingDb } from "@/domain/db";

/** Liveness probe (spec §3.5): 200 when the service and its storage respond. */
export default defineRoute<"health">(({ GET }) => [
  GET<{
    response: [200, "json", { ok: true }] | [503, "json", { ok: false; error: string }];
  }>(async (ctx) => {
    try {
      await pingDb();
      return ctx.json({ ok: true as const }, 200);
    } catch (error) {
      return ctx.json(
        { ok: false as const, error: error instanceof Error ? error.message : String(error) },
        503,
      );
    }
  }),
]);
