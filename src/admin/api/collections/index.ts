import { defineRoute } from "_/api";

import { type CollectionView, createCollection, listCollections } from "@/domain/collections";

/**
 * Collections (spec §2.3, §5.2, §5.3): everyone lists what their scope allows, with live
 * counters; only operators (or someone impersonating one) create.
 * */
export default defineRoute<"collections">(({ GET, POST }) => [
  GET<{
    query: { operatorId?: string; adminId?: string };
    response: [200, "json", { collections: Array<CollectionView> }];
  }>(async (event) => {
    const { operatorId, adminId } = event.validated.query;
    return {
      collections: await listCollections(event.context.auth.actor, {
        ...(operatorId ? { operatorId } : {}),
        ...(adminId ? { adminId } : {}),
      }),
    };
  }),

  POST<{
    json: {
      name: VRefine<string, { minLength: 1; maxLength: 100 }>;
      scheduleMode?: "after_review" | "immediate";
      providerId?: string | null;
    };
    response: [201, "json", { collection: CollectionView }];
  }>(async (event) => {
    const collection = await createCollection(event.context.auth.actor, event.validated.json);
    event.res.status = 201;
    return { collection };
  }),
]);
