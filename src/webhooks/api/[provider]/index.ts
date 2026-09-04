import { defineRoute } from "_/api";

import { applyDeliveryEvents } from "@/domain/sending";

/**
 * Delivery-event webhook (spec §3.4, §4.3): POST /webhooks/:provider with a batch of
 * normalized events, each naming the email by MailHub id or provider message id.
 * Unknown ids count as unmatched; the endpoint never errors on them. Provider-native
 * payloads with signature verification plug in here per type when a hosted type ships.
 * */
export default defineRoute<"[provider]", [string]>(({ POST }) => [
  POST<{
    json: {
      events: VRefine<
        Array<{
          emailId?: string;
          messageId?: string;
          status: "sent" | "delivered" | "bounced";
        }>,
        { maxItems: 1000 }
      >;
    };
    response: [200, "json", { provider: string; matched: number; unmatched: number }];
  }>(async (ctx) => {
    const { matched, unmatched } = await applyDeliveryEvents(ctx.validated.json.events);
    return ctx.json({ provider: ctx.validated.params.provider, matched, unmatched }, 200);
  }),
]);
