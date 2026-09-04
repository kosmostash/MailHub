import { use } from "_/api";

import { DomainError } from "@/domain/errors";
import { resolveSubmissionTarget } from "@/domain/emails";

/**
 * Submission auth (spec §3.1): the collection id in x-collection-id is the only credential.
 * Unknown or missing → 401; known but suspended → 403, distinguishable, naming the reason.
 * */
export default [
  use(
    async function requireCollection(ctx, next) {
      const target = await resolveSubmissionTarget(ctx.req.header("x-collection-id"));
      if (target.status === "unknown") {
        throw new DomainError(401, "unknown_collection", "Unknown or missing x-collection-id");
      }
      if (target.status !== "ok") {
        throw new DomainError(
          403,
          "collection_suspended",
          target.status === "admin_disabled"
            ? "This collection's admin is disabled; submissions are refused until re-enabled"
            : "This collection's operator is disabled; submissions are refused until re-enabled",
          { reason: target.status },
        );
      }
      ctx.set("collection", target.collection);
      return next();
    },
    { slot: "collection" },
  ),
];
