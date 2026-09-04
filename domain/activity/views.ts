import { forbidden, notFound } from "../errors";
import type { Actor } from "../accounts/types";
import { findUserById } from "../accounts/users";
import { type ActivityEntry, listActivity } from "./index";

export type ActivityQuery = {
  adminId?: string | undefined;
  operatorId?: string | undefined;
  before?: string | undefined;
  limit?: number | undefined;
};

/**
 * The trail as each role may see it (spec §2.6, §5.9): the superadmin everything, an admin
 * their own subtree (optionally one operator of theirs), an operator only their own.
 * */
export const listActivityFor = async (
  actor: Actor,
  query: ActivityQuery,
): Promise<{ entries: Array<ActivityEntry>; nextBefore: string | null }> => {
  const { user } = actor;
  const page = { before: query.before, limit: query.limit } as { before?: string; limit?: number };
  if (query.before !== undefined) page.before = query.before;
  if (query.limit !== undefined) page.limit = query.limit;

  switch (user.role) {
    case "superadmin": {
      const filter: Parameters<typeof listActivity>[0] = { ...page };
      if (query.operatorId) filter.operatorId = query.operatorId;
      else if (query.adminId) filter.adminId = query.adminId;
      return listActivity(filter);
    }
    case "admin": {
      if (query.operatorId) {
        const operator = await findUserById(query.operatorId);
        if (!operator || operator.role !== "operator" || operator.admin_id !== user.id) {
          throw notFound("Operator");
        }
        return listActivity({ operatorId: operator.id, ...page });
      }
      return listActivity({ adminId: user.id, ...page });
    }
    case "operator": {
      if (query.operatorId && query.operatorId !== user.id) {
        throw forbidden("Operators see only their own trail");
      }
      return listActivity({ operatorId: user.id, ...page });
    }
  }
};
