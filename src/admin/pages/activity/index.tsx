import { useSearchParams } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { createMemo, createSignal, For, Show } from "solid-js";

import { Button, formatDate } from "~/components/ui";
import { api } from "~/lib/api";
import { useMe } from "~/lib/session";

type Entry = {
  id: string;
  at: string;
  action: string;
  objectType: string;
  objectId: string | null;
  actor: { id: string | null; email: string | null; role: string };
  via: { id: string | null; email: string | null } | null;
  details: Record<string, unknown>;
};

/**
 * The activity trail (spec §5.9): filterable by operator (and by admin for the superadmin),
 * newest first, with the "via impersonation by …" marker. Operators see their own.
 * */
export default function ActivityPage() {
  const me = useMe();
  const [search, setSearch] = useSearchParams();
  const role = () => me.data?.actor.role;
  const adminId = () => (typeof search.adminId === "string" ? search.adminId : "");
  const operatorId = () => (typeof search.operatorId === "string" ? search.operatorId : "");
  const [pages, setPages] = createSignal<Array<Entry>>([]);
  const [before, setBefore] = createSignal<string | null>(null);

  const filter = () => ({
    ...(adminId() ? { adminId: adminId() } : {}),
    ...(operatorId() ? { operatorId: operatorId() } : {}),
    limit: 50,
  });

  const page = useQuery(() => ({
    queryKey: ["activity", filter(), before()],
    queryFn: () => api["activity"].GET([], { query: { ...filter(), ...(before() ? { before: before()! } : {}) } }),
  }));

  const admins = useQuery(() => ({
    queryKey: ["admins"],
    queryFn: () => api["admins"].GET(),
    enabled: role() === "superadmin",
  }));
  const operators = useQuery(() => ({
    queryKey: ["operators"],
    queryFn: () => api["operators"].GET(),
    enabled: role() === "admin",
  }));

  const entries = createMemo(() => [...pages(), ...(page.data?.entries ?? [])]);

  const loadMore = () => {
    const next = page.data?.nextBefore;
    if (!next) return;
    setPages(entries());
    setBefore(next);
  };
  const resetPaging = () => {
    setPages([]);
    setBefore(null);
  };

  return (
    <div>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <h1 class="text-xl font-semibold">Activity</h1>
        <Show when={role() === "superadmin"}>
          <select
            class="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={adminId()}
            onChange={(e) => { resetPaging(); setSearch({ adminId: e.currentTarget.value || undefined, operatorId: undefined }); }}
          >
            <option value="">all admins</option>
            <For each={admins.data?.admins}>{(a) => <option value={a.id}>{a.email}</option>}</For>
          </select>
        </Show>
        <Show when={role() === "admin"}>
          <select
            class="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={operatorId()}
            onChange={(e) => { resetPaging(); setSearch({ operatorId: e.currentTarget.value || undefined }); }}
          >
            <option value="">all operators and me</option>
            <For each={operators.data?.operators}>{(o) => <option value={o.id}>{o.email}</option>}</For>
          </select>
        </Show>
      </div>

      <div class="card overflow-x-auto p-0">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th class="px-4 py-2">When</th>
              <th class="px-4 py-2">Action</th>
              <th class="px-4 py-2">Object</th>
              <th class="px-4 py-2">Actor</th>
              <th class="px-4 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            <For
              each={entries()}
              fallback={
                <tr>
                  <td class="px-4 py-6 text-center text-gray-500" colSpan={5}>
                    <Show when={page.isPending} fallback="Nothing recorded yet.">Loading…</Show>
                  </td>
                </tr>
              }
            >
              {(e) => (
                <tr class="border-t border-gray-100 align-top">
                  <td class="whitespace-nowrap px-4 py-2 text-gray-600">{formatDate(e.at)}</td>
                  <td class="whitespace-nowrap px-4 py-2 font-mono text-xs">{e.action}</td>
                  <td class="px-4 py-2 text-gray-600">
                    {e.objectType}
                    <Show when={e.objectId}>
                      <span class="block max-w-[14rem] truncate font-mono text-xs text-gray-400" title={e.objectId!}>{e.objectId}</span>
                    </Show>
                  </td>
                  <td class="px-4 py-2">
                    <span class="font-medium">{e.actor.email ?? e.actor.role}</span>
                    <span class="text-gray-500"> ({e.actor.role})</span>
                    <Show when={e.via}>
                      {(via) => (
                        <span class="mt-0.5 block text-xs text-amber-800">
                          <span class="i-tabler-mask" aria-hidden="true" /> via impersonation by {via().email}
                        </span>
                      )}
                    </Show>
                  </td>
                  <td class="max-w-md px-4 py-2 font-mono text-xs text-gray-600">
                    {Object.entries(e.details)
                      .filter(([, v]) => v !== null && v !== undefined && v !== "")
                      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                      .join(" · ")}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Show when={page.data?.nextBefore}>
        <div class="mt-3 flex justify-center">
          <Button variant="secondary" icon="i-tabler-chevrons-down" onClick={loadMore}>Load older</Button>
        </div>
      </Show>
    </div>
  );
}
