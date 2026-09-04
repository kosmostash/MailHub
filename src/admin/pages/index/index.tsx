import { Navigate, useSearchParams } from "@solidjs/router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";

import { CollectionCard } from "~/components/CollectionCard";
import { CollectionForm } from "~/components/CollectionForm";
import Link from "~/components/Link";
import { Button } from "~/components/ui";
import { api } from "~/lib/api";
import { useMe } from "~/lib/session";

/**
 * Landing view after sign-in (spec §5.2). Operators: their collections and a create
 * action. Admins: every operator's collections, grouped, read-only. Superadmin: the
 * Admins page, or an admin's collections when drilling down (?adminId=).
 * */
export default function DashboardPage() {
  const me = useMe();
  const [search] = useSearchParams();
  const role = () => me.data?.actor.role;
  const adminId = () => (typeof search.adminId === "string" ? search.adminId : undefined);
  const operatorId = () => (typeof search.operatorId === "string" ? search.operatorId : undefined);

  return (
    <Switch>
      <Match when={role() === "superadmin" && !adminId() && !operatorId()}>
        <Navigate href="/admins" />
      </Match>
      <Match when={role() === "operator"}>
        <OperatorDashboard />
      </Match>
      <Match when={role() === "admin" || role() === "superadmin"}>
        <OverseerDashboard adminId={adminId()} operatorId={operatorId()} />
      </Match>
    </Switch>
  );
}

const useCollections = (filter: () => { adminId?: string; operatorId?: string }) =>
  useQuery(() => ({
    queryKey: ["collections", filter()],
    queryFn: () => api["collections"].GET([], { query: filter() }),
  }));

function OperatorDashboard() {
  const client = useQueryClient();
  const collections = useCollections(() => ({}));
  const [creating, setCreating] = createSignal(false);

  return (
    <div>
      <div class="mb-4 flex items-center justify-between gap-4">
        <h1 class="text-xl font-semibold">Dashboard</h1>
        <Button icon="i-tabler-folder-plus" onClick={() => setCreating(true)}>
          New collection
        </Button>
      </div>
      <Show when={creating()}>
        <div class="card mb-4 max-w-lg">
          <h2 class="mb-3 font-semibold">New collection</h2>
          <CollectionForm
            submitLabel="Create"
            submit={async (values) => {
              await api["collections"].POST([], { json: values });
              setCreating(false);
              await client.invalidateQueries({ queryKey: ["collections"] });
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      </Show>
      <Show
        when={collections.data?.collections.length}
        fallback={
          <Show when={collections.data}>
            <div class="card max-w-md text-sm text-gray-600">
              <span class="i-tabler-inbox text-2xl text-gray-400" aria-hidden="true" />
              <p class="mt-2">No collections yet. Create one per project or email stream; its id is the API key your project submits with.</p>
            </div>
          </Show>
        }
      >
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <For each={collections.data?.collections}>{(c) => <CollectionCard collection={c} />}</For>
        </div>
      </Show>
    </div>
  );
}

function OverseerDashboard(props: { adminId?: string | undefined; operatorId?: string | undefined }) {
  const collections = useCollections(() => ({
    ...(props.adminId ? { adminId: props.adminId } : {}),
    ...(props.operatorId ? { operatorId: props.operatorId } : {}),
  }));
  const groups = createMemo(() => {
    const map = new Map<string, Array<NonNullable<typeof collections.data>["collections"][number]>>();
    for (const c of collections.data?.collections ?? []) {
      const list = map.get(c.operator.email) ?? [];
      list.push(c);
      map.set(c.operator.email, list);
    }
    return [...map.entries()];
  });

  return (
    <div>
      <div class="mb-4 flex items-center justify-between gap-4">
        <h1 class="text-xl font-semibold">Dashboard</h1>
        <div class="flex gap-2">
          <Link to={["providers"]} class="btn-secondary">
            <span class="i-tabler-server" aria-hidden="true" /> Providers
          </Link>
          <Link to={["operators"]} class="btn-secondary">
            <span class="i-tabler-users" aria-hidden="true" /> Operators
          </Link>
        </div>
      </div>
      <p class="mb-4 max-w-prose text-sm text-gray-600">
        Read-only view across operators. To approve, send or change anything, impersonate the operator.
      </p>
      <Show
        when={groups().length}
        fallback={
          <Show when={collections.data}>
            <div class="card max-w-md text-sm text-gray-600">No collections yet.</div>
          </Show>
        }
      >
        <For each={groups()}>
          {([email, list]) => (
            <section class="mb-6">
              <h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <span class="i-tabler-user" aria-hidden="true" /> {email}
              </h2>
              <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <For each={list}>{(c) => <CollectionCard collection={c} />}</For>
              </div>
            </section>
          )}
        </For>
      </Show>
    </div>
  );
}
