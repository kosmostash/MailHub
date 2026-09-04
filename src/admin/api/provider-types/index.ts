import { defineRoute } from "_/api";

import { providerTypes } from "@/domain/providers";
import type { ProviderTypeInfo } from "@/domain/providers/registry";

/** The provider types this installation offers, with their configuration forms (spec §2.4). */
export default defineRoute<"provider-types">(({ GET }) => [
  GET<{
    response: [200, "json", { types: Array<ProviderTypeInfo> }];
  }>(async () => {
    return { types: providerTypes() };
  }),
]);
