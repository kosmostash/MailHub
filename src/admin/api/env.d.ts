import type { AuthContext } from "@/domain/sessions";

export declare module "_/api" {
  interface DefaultContext {
    /** set by api/use.ts for every route except those overriding the "auth" slot */
    auth: AuthContext;
  }
}

export declare module "@kosmojs/core/api" {
  interface UseSlots {
    /** session check; public routes (bootstrap, sign-in) replace it with a pass-through */
    auth: string;
  }
}
