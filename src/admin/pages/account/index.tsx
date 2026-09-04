import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";

import { Button, ErrorNote, Field, formatDate } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";
import { useMe } from "~/lib/session";

/**
 * Account (spec §5.10): test addresses for operators now; email and password changes
 * with their confirmation step arrive with Phase 6.
 * */
export default function AccountPage() {
  const me = useMe();
  return (
    <div>
      <h1 class="mb-1 text-xl font-semibold">Account</h1>
      <p class="mb-4 text-sm text-gray-600">
        {me.data?.actor.email} · {me.data?.actor.role}
        <Show when={me.data?.impersonating}> (impersonated: these are the assumed identity's settings)</Show>
      </p>
      <Show when={me.data?.actor.role === "operator"}>
        <TestAddresses />
      </Show>
      <div class="card mt-4 max-w-lg text-sm text-gray-600">
        <h2 class="mb-1 font-semibold text-gray-900">Email and password</h2>
        <p>Changing your own credentials requires a confirmation code; this lands in a later phase.</p>
      </div>
    </div>
  );
}

function TestAddresses() {
  const client = useQueryClient();
  const list = useQuery(() => ({ queryKey: ["test-addresses"], queryFn: () => api["account/test-addresses"].GET() }));
  const [address, setAddress] = createSignal("");
  const [label, setLabel] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const refresh = () => client.invalidateQueries({ queryKey: ["test-addresses"] });

  const add = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api["account/test-addresses"].POST([], { json: { address: address(), ...(label() ? { label: label() } : {}) } });
      setAddress("");
      setLabel("");
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api["account/test-addresses/[id]"].DELETE([id]);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div class="card max-w-lg">
      <h2 class="mb-1 font-semibold">Test addresses</h2>
      <p class="mb-3 text-sm text-gray-600">"Send to me" delivers a [test] copy of any email to one of these. Newest first.</p>
      <form class="mb-3 flex flex-col gap-2" onSubmit={add}>
        <Field label="Address" type="email" value={address()} onInput={setAddress} placeholder="me@example.com" />
        <Field label="Label (optional)" value={label()} onInput={setLabel} required={false} placeholder="My inbox" />
        <ErrorNote message={error()} />
        <div>
          <Button type="submit" icon="i-tabler-plus" busy={busy()}>Add test address</Button>
        </div>
      </form>
      <ul class="divide-y divide-gray-100 text-sm">
        <For each={list.data?.testAddresses} fallback={<li class="py-2 text-gray-500">No test addresses yet.</li>}>
          {(t) => (
            <li class="flex items-center justify-between gap-2 py-2">
              <span>
                <span class="font-medium">{t.address}</span>
                <Show when={t.label}> <span class="text-gray-500">· {t.label}</span></Show>
                <span class="block text-xs text-gray-400">added {formatDate(t.createdAt)}</span>
              </span>
              <Button variant="secondary" icon="i-tabler-trash" onClick={() => remove(t.id)}>Remove</Button>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
