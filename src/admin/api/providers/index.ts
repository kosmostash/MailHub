import { defineRoute } from "_/api";

import { createProvider, listProviders, type ProviderView } from "@/domain/providers";

/**
 * Providers (spec §2.4, §5.6). Admins: full CRUD, secrets masked in responses.
 * Operators: name and type only, to pick from. Superadmin: read-only across admins.
 * */
export default defineRoute<"providers">(({ GET, POST }) => [
  GET<{
    query: { adminId?: string };
    response: [200, "json", { providers: Array<ProviderView> }];
  }>(async (event) => {
    const { adminId } = event.validated.query;
    return {
      providers: await listProviders(event.context.auth.actor, adminId ? { adminId } : {}),
    };
  }),

  POST<{
    json: {
      name: VRefine<string, { minLength: 1; maxLength: 100 }>;
      type: VRefine<string, { minLength: 1; maxLength: 40 }>;
      config: Record<string, unknown>;
    };
    response: [201, "json", { provider: ProviderView }];
  }>(async (event) => {
    const provider = await createProvider(event.context.auth.actor, event.validated.json);
    event.res.status = 201;
    return { provider };
  }),
]);
