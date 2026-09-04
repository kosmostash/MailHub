import { defineRoute } from "_/api";

import { type EmailView, storeEmail } from "@/domain/emails";

type AddressInput = string | { address: string; name?: string };

/**
 * Submit an email (spec §3.2). Stores only - the response never waits for a send.
 * 201 with the stored email, in `pending` or `ready` per the collection's schedule mode.
 * */
export default defineRoute<"emails">(({ POST }) => [
  POST<{
    json: {
      from: AddressInput;
      to: VRefine<Array<AddressInput>, { minItems: 1 }>;
      cc?: Array<AddressInput>;
      bcc?: Array<AddressInput>;
      subject?: VRefine<string, { maxLength: 2000 }>;
      text?: string;
      html?: string;
    };
    response: [201, "json", EmailView];
  }>(async (ctx) => {
    const email = await storeEmail(ctx.get("collection"), ctx.validated.json, "http");
    return ctx.json(email, 201);
  }),
]);
