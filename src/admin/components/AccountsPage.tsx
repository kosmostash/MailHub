import { useNavigate } from "@solidjs/router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";

import { api, errorMessage } from "~/lib/api";
import { useResetSession } from "~/lib/session";
import { Button, ErrorNote, Field, formatDate, Pill } from "./ui";

type Kind = "admins" | "operators";

/**
 * Admins (spec §5.8) and Operators (spec §5.7) share one page: summary rows, create,
 * reset password, impersonate. Disable, reassign and delete arrive with Phase 5.
 * */
export function AccountsPage(props: { kind: Kind }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const resetSession = useResetSession();
  const singular = () => (props.kind === "admins" ? "admin" : "operator");

  const list = useQuery(() => ({
    queryKey: [props.kind],
    queryFn: async () => {
      const data = props.kind === "admins" ? await api["admins"].GET() : await api["operators"].GET();
      return props.kind === "admins"
        ? (data as { admins: Array<Row> }).admins
        : (data as { operators: Array<Row> }).operators;
    },
  }));

  const [creating, setCreating] = createSignal(false);
  const [resetting, setResetting] = createSignal<Row | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const refresh = () => client.invalidateQueries({ queryKey: [props.kind] });

  const impersonate = async (row: Row) => {
    setError(null);
    try {
      await api["impersonation"].POST([], { json: { userId: row.id } });
      await resetSession();
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <div class="mb-4 flex items-center justify-between gap-4">
        <h1 class="text-xl font-semibold capitalize">{props.kind}</h1>
        <Button icon="i-tabler-user-plus" onClick={() => setCreating(true)}>
          New {singular()}
        </Button>
      </div>
      <ErrorNote message={error()} />

      <Show when={creating()}>
        <CreateForm
          kind={props.kind}
          onDone={async () => {
            setCreating(false);
            await refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      </Show>
      <Show when={resetting()}>
        {(row) => (
          <ResetPasswordForm
            kind={props.kind}
            row={row()}
            onDone={async () => {
              setResetting(null);
              await refresh();
            }}
            onCancel={() => setResetting(null)}
          />
        )}
      </Show>

      <div class="card mt-4 overflow-x-auto p-0">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th class="px-4 py-2">Email</th>
              <Show when={props.kind === "admins"}>
                <th class="px-4 py-2 text-right">Operators</th>
                <th class="px-4 py-2 text-right">Providers</th>
              </Show>
              <th class="px-4 py-2 text-right">Collections</th>
              <th class="px-4 py-2 text-right">Pending</th>
              <th class="px-4 py-2">Last activity</th>
              <th class="px-4 py-2">State</th>
              <th class="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For
              each={list.data}
              fallback={
                <tr>
                  <td class="px-4 py-6 text-center text-gray-500" colSpan={8}>
                    <Show when={list.isPending} fallback={`No ${props.kind} yet.`}>
                      Loading…
                    </Show>
                  </td>
                </tr>
              }
            >
              {(row) => (
                <tr class="border-t border-gray-100">
                  <td class="px-4 py-2 font-medium">{row.email}</td>
                  <Show when={props.kind === "admins"}>
                    <td class="px-4 py-2 text-right tabular-nums">{row.operators}</td>
                    <td class="px-4 py-2 text-right tabular-nums">{row.providers}</td>
                  </Show>
                  <td class="px-4 py-2 text-right tabular-nums">{row.collections}</td>
                  <td class="px-4 py-2 text-right tabular-nums">
                    <Show when={row.pending > 0} fallback={<span class="text-gray-400">0</span>}>
                      <Pill kind="pending">{row.pending}</Pill>
                    </Show>
                  </td>
                  <td class="px-4 py-2 text-gray-600">{formatDate(row.lastActivityAt)}</td>
                  <td class="px-4 py-2">
                    <Show when={row.disabled} fallback={<Pill kind="sent">enabled</Pill>}>
                      <Pill kind="muted">disabled</Pill>
                    </Show>
                  </td>
                  <td class="px-4 py-2">
                    <div class="flex justify-end gap-2">
                      <Button variant="secondary" icon="i-tabler-key" onClick={() => setResetting(row)}>
                        Reset password
                      </Button>
                      <Button
                        variant="secondary"
                        icon="i-tabler-mask"
                        disabled={row.disabled}
                        onClick={() => impersonate(row)}
                      >
                        Impersonate
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Row = {
  id: string;
  email: string;
  disabled: boolean;
  operators: number;
  providers: number;
  collections: number;
  pending: number;
  lastActivityAt: string | null;
};

function CreateForm(props: { kind: Kind; onDone: () => Promise<void>; onCancel: () => void }) {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const json = { email: email(), password: password() };
      if (props.kind === "admins") {
        await api["admins"].POST([], { json });
      } else {
        await api["operators"].POST([], { json });
      }
      await props.onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="card mt-2 flex max-w-md flex-col gap-3" onSubmit={submit}>
      <h2 class="font-semibold">New {props.kind === "admins" ? "admin" : "operator"}</h2>
      <Field label="Email" type="email" value={email()} onInput={setEmail} autocomplete="off" />
      <Field label="Initial password" type="password" value={password()} onInput={setPassword} autocomplete="new-password" minlength={8} />
      <ErrorNote message={error()} />
      <div class="flex gap-2">
        <Button type="submit" icon="i-tabler-check" busy={busy()}>
          Create
        </Button>
        <Button type="button" variant="secondary" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ResetPasswordForm(props: { kind: Kind; row: Row; onDone: () => Promise<void>; onCancel: () => void }) {
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const json = { password: password() };
      if (props.kind === "admins") {
        await api["admins/[id]/password"].POST([props.row.id], { json });
      } else {
        await api["operators/[id]/password"].POST([props.row.id], { json });
      }
      await props.onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="card mt-2 flex max-w-md flex-col gap-3" onSubmit={submit}>
      <h2 class="font-semibold">Reset password for {props.row.email}</h2>
      <p class="text-sm text-gray-600">Their current sessions are signed out.</p>
      <Field label="New password" type="password" value={password()} onInput={setPassword} autocomplete="new-password" minlength={8} />
      <ErrorNote message={error()} />
      <div class="flex gap-2">
        <Button type="submit" icon="i-tabler-key" busy={busy()}>
          Reset
        </Button>
        <Button type="button" variant="secondary" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
