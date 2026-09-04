import type { SubmissionCollection } from "@/domain/emails";

export declare module "_/api" {
  interface DefaultVariables {
    /** the collection behind the x-collection-id header, set by api/use.ts */
    collection: SubmissionCollection;
  }
  interface DefaultBindings {}
}

export declare module "@kosmojs/core/api" {
  interface UseSlots {
    /** collection-id check; health replaces it with a pass-through */
    collection: string;
  }
}
