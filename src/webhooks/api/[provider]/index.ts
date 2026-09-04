import { defineRoute } from "_/api";

/**
 * Delivery-event webhook (spec §3.4): POST /webhooks/:provider
 *
 * Phase 0 stub. Phase 4 adds the normalized event batch
 * ({ events: [{ emailId? | messageId?, status }] } → { matched, unmatched })
 * and, per provider type, the native payload with raw-body signature verification.
 * */
export default defineRoute<"[provider]">(({ POST }) => [
  POST<{
    response: [501, "json", { error: { code: "not_implemented"; message: string } }];
  }>(async (ctx) => {
    const { provider } = ctx.validated.params;
    return ctx.json(
      {
        error: {
          code: "not_implemented" as const,
          message: `Webhook for provider "${provider}" is not implemented yet`,
        },
      },
      501,
    );
  }),
]);
