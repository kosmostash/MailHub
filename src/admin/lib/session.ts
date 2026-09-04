import { useQuery, useQueryClient } from "@tanstack/solid-query";

import { api } from "./api";

export const meKey = ["me"] as const;

/** The signed-in identity, cached for the whole app; 401 surfaces as `error`. */
export const useMe = () =>
  useQuery(() => ({
    queryKey: meKey,
    queryFn: () => api["me"].GET(),
    retry: false,
    staleTime: 60_000,
  }));

/**
 * Everything cached belongs to the previous identity once sign-in or impersonation changes.
 * resetQueries (not clear) keeps mounted observers attached, so the shell re-renders.
 * */
export const useResetSession = () => {
  const client = useQueryClient();
  return async () => {
    await client.cancelQueries();
    // drop everything fetched as the previous identity; only the identity itself refetches now
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== meKey[0] });
    await client.resetQueries({ queryKey: meKey });
  };
};
