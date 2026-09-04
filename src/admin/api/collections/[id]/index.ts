import { defineRoute } from "_/api";

import {
  type CollectionView,
  deleteCollection,
  getCollection,
  updateCollection,
} from "@/domain/collections";

export default defineRoute<"collections/[id]", [string]>(({ GET, PATCH, DELETE }) => [
  GET<{
    response: [200, "json", { collection: CollectionView }];
  }>(async (event) => {
    return { collection: await getCollection(event.context.auth.actor, event.validated.params.id) };
  }),

  PATCH<{
    json: {
      name?: VRefine<string, { minLength: 1; maxLength: 100 }>;
      scheduleMode?: "after_review" | "immediate";
      providerId?: string | null;
    };
    response: [200, "json", { collection: CollectionView }];
  }>(async (event) => {
    return {
      collection: await updateCollection(
        event.context.auth.actor,
        event.validated.params.id,
        event.validated.json,
      ),
    };
  }),

  DELETE<{
    response: [200, "json", { ok: true }];
  }>(async (event) => {
    await deleteCollection(event.context.auth.actor, event.validated.params.id);
    return { ok: true as const };
  }),
]);
