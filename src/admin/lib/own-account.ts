import type { AuthContext } from "@/domain/sessions";
import { forbidden } from "@/domain/errors";

/** Credential and second-factor changes are personal: never while impersonating (spec §5). */
export const ownAccount = (auth: AuthContext) => {
  if (auth.impersonating) {
    throw forbidden("End impersonation to manage your own account", "impersonating");
  }
  return auth.principal;
};
