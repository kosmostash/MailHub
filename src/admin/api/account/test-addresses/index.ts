import { defineRoute } from "_/api";

import { createTestAddress, listTestAddresses, type TestAddressView } from "@/domain/accounts/test-addresses";

/** Test addresses (spec §2.5): the acting operator's, newest first. */
export default defineRoute<"account/test-addresses">(({ GET, POST }) => [
  GET<{
    response: [200, "json", { testAddresses: Array<TestAddressView> }];
  }>(async (event) => {
    return { testAddresses: await listTestAddresses(event.context.auth.actor) };
  }),

  POST<{
    json: {
      address: VRefine<string, { format: "email" }>;
      label?: VRefine<string, { maxLength: 100 }>;
    };
    response: [201, "json", { testAddress: TestAddressView }];
  }>(async (event) => {
    const testAddress = await createTestAddress(event.context.auth.actor, event.validated.json);
    event.res.status = 201;
    return { testAddress };
  }),
]);
