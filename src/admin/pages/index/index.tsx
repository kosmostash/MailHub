import { Navigate } from "@solidjs/router";
import { Match, Switch } from "solid-js";

import Link from "~/components/Link";
import { useMe } from "~/lib/session";

/** Landing view after sign-in (spec §5.2); collection cards arrive with Phase 2. */
export default function DashboardPage() {
  const me = useMe();
  const role = () => me.data?.actor.role;

  return (
    <Switch>
      <Match when={role() === "superadmin"}>
        <Navigate href="/admins" />
      </Match>
      <Match when={role() === "admin"}>
        <h1 class="mb-4 text-xl font-semibold">Dashboard</h1>
        <p class="mb-4 max-w-prose text-sm text-gray-600">
          Collections across your operators will appear here, read-only. To act on them, impersonate
          the operator from the Operators page.
        </p>
        <Link to={["operators"]} class="btn-primary">
          <span class="i-tabler-users" aria-hidden="true" /> Manage operators
        </Link>
      </Match>
      <Match when={role() === "operator"}>
        <h1 class="mb-4 text-xl font-semibold">Dashboard</h1>
        <div class="card max-w-md text-sm text-gray-600">
          <span class="i-tabler-inbox text-2xl text-gray-400" aria-hidden="true" />
          <p class="mt-2">No collections yet. Creating collections lands in the next phase.</p>
        </div>
      </Match>
    </Switch>
  );
}
