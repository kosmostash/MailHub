import { defineRoute } from "_/api";

import { pingDb } from "@/domain/db";

/** Liveness probe (spec §3.5): 200 when the service and its storage respond. No credential. */
export default defineRoute<"health">(({ GET, use }) => [
  use(async (_ctx, next) => next(), { slot: "collection" }),

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
