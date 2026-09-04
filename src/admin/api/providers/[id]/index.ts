import { defineRoute } from "_/api";

import { deleteProvider, getProvider, type ProviderView, updateProvider } from "@/domain/providers";

export default defineRoute<"providers/[id]", [string]>(({ GET, PATCH, DELETE }) => [
  GET<{
    response: [200, "json", { provider: ProviderView }];
  }>(async (event) => {
    return { provider: await getProvider(event.context.auth.actor, event.validated.params.id) };
  }),

  PATCH<{
    json: {
      name?: VRefine<string, { minLength: 1; maxLength: 100 }>;
      config?: Record<string, unknown>;
    };
    response: [200, "json", { provider: ProviderView }];
  }>(async (event) => {
    return {
      provider: await updateProvider(
        event.context.auth.actor,
        event.validated.params.id,
        event.validated.json,
      ),
    };
  }),

  DELETE<{
    response: [200, "json", { ok: true }];
  }>(async (event) => {
    await deleteProvider(event.context.auth.actor, event.validated.params.id);
    return { ok: true as const };
  }),
]);
