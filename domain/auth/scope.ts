import { forbidden } from "../errors";
import type { Role, UserRow } from "../accounts/types";

/**
 * What an identity may see (spec §6, "scoping is absolute"). Repositories take a Scope
 * and turn it into WHERE clauses, so out-of-scope ids behave exactly like missing ones.
 * */
export type Scope =
  | { kind: "all" }
  | { kind: "admin"; adminId: string }
  | { kind: "operator"; operatorId: string; adminId: string };

export const scopeOf = (user: UserRow): Scope => {
  switch (user.role) {
    case "superadmin":
      return { kind: "all" };
    case "admin":
      return { kind: "admin", adminId: user.id };
    case "operator":
      return { kind: "operator", operatorId: user.id, adminId: user.admin_id! };
  }
};

/** Throws 403 unless the acting identity has one of the roles. */
export const requireRole = (user: UserRow, ...roles: Array<Role>): void => {
  if (!roles.includes(user.role)) {
    throw forbidden(`This action requires role ${roles.join(" or ")}`);
  }
};
