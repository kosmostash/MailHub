import { useNavigate } from "@solidjs/router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";

import Link from "~/components/Link";
import { api, errorMessage } from "~/lib/api";
import { useResetSession } from "~/lib/session";
import { Button, ErrorNote, Field, formatDate, Pill } from "./ui";

type Kind = "admins" | "operators";

/**
 * Admins (spec §5.8) and Operators (spec §5.7) share one page: summary rows, create,
 * reset password, impersonate, disable / re-enable, reassign a disabled account's objects,
 * delete an emptied one.
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
  const [reassigning, setReassigning] = createSignal<Row | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);

  const refresh = () => client.invalidateQueries({ queryKey: [props.kind] });

  const holds = (row: Row) =>
    props.kind === "admins" ? row.operators + row.providers > 0 : row.collections > 0;

  const act = async (fn: () => Promise<string | null>) => {
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const disable = (row: Row) => {
    const scope =
      props.kind === "admins"
        ? "This signs out the admin and every operator under them, refuses submissions to their collections and stops their mail until re-enabled."
        : "This signs out the operator, refuses submissions to their collections and stops their mail until re-enabled.";
    if (!window.confirm(`Disable ${row.email}?\n\n${scope}`)) return;
    return act(async () => {
      if (props.kind === "admins") await api["admins/[id]/disable"].POST([row.id]);
      else await api["operators/[id]/disable"].POST([row.id]);
      return `${row.email} is disabled.`;
    });
  };

  const enable = (row: Row) =>
    act(async () => {
      if (props.kind === "admins") await api["admins/[id]/enable"].POST([row.id]);
      else await api["operators/[id]/enable"].POST([row.id]);
      return `${row.email} is enabled again; held mail resumes.`;
    });

  const remove = (row: Row) => {
    if (!window.confirm(`Delete ${row.email}? The activity trail keeps its history.`)) return;
    return act(async () => {
      if (props.kind === "admins") await api["admins/[id]"].DELETE([row.id]);
      else await api["operators/[id]"].DELETE([row.id]);
      return `${row.email} is deleted.`;
    });
  };

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
      <Show when={notice()}>
        <p class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800" role="status">{notice()}</p>
      </Show>

      <Show when={reassigning()} keyed>
        {(row) => (
          <ReassignForm
            kind={props.kind}
            row={row}
            onDone={async (message) => {
              setReassigning(null);
              setNotice(message);
              await refresh();
            }}
            onCancel={() => setReassigning(null)}
          />
        )}
      </Show>

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
      <Show when={resetting()} keyed>
        {(row) => (
          <ResetPasswordForm
            kind={props.kind}
            row={row}
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
                      <Link
                        to={["index"]}
                        query={props.kind === "admins" ? { adminId: row.id } : { operatorId: row.id }}
                        class="btn-secondary"
                      >
                        <span class="i-tabler-folders" aria-hidden="true" /> Collections
                      </Link>
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
                      <Show
                        when={row.disabled}
                        fallback={
                          <Button variant="danger" icon="i-tabler-ban" onClick={() => disable(row)}>
                            Disable
                          </Button>
                        }
                      >
                        <Button variant="secondary" icon="i-tabler-circle-check" onClick={() => enable(row)}>
                          Enable
                        </Button>
                        <Show when={holds(row)}>
                          <Button variant="secondary" icon="i-tabler-arrows-exchange" onClick={() => setReassigning(row)}>
                            Reassign
                          </Button>
                        </Show>
                        <Show when={!holds(row)}>
                          <Button variant="danger" icon="i-tabler-trash" onClick={() => remove(row)}>
                            Delete
                          </Button>
                        </Show>
                      </Show>
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

function ReassignForm(props: { kind: Kind; row: Row; onDone: (message: string) => Promise<void>; onCancel: () => void }) {
  const targets = useQuery(() => ({
    queryKey: [props.kind, "reassign-targets", props.row.id],
    queryFn: () =>
      props.kind === "admins"
        ? api["admins/[id]/reassign"].GET([props.row.id])
        : api["operators/[id]/reassign"].GET([props.row.id]),
  }));
  const [targetId, setTargetId] = createSignal("");
  const chosen = () => targetId() || targets.data?.targets[0]?.id || "";
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const json = { targetId: chosen() };
      const { summary } =
        props.kind === "admins"
          ? await api["admins/[id]/reassign"].POST([props.row.id], { json })
          : await api["operators/[id]/reassign"].POST([props.row.id], { json });
      const moved =
        props.kind === "admins"
          ? `${summary.operators} operator(s) and ${summary.providers} provider(s)`
          : `${summary.collections} collection(s)`;
      await props.onDone(`Moved ${moved} from ${summary.from.email} to ${summary.to.email}. Their mail resumes.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="card mt-2 flex max-w-md flex-col gap-3" onSubmit={submit}>
      <h2 class="font-semibold">Reassign {props.row.email}'s {props.kind === "admins" ? "operators and providers" : "collections"}</h2>
      <p class="text-sm text-gray-600">
        Collection ids never change, so client projects keep working. The receiving account must be active.
      </p>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700" for="reassign-target">Move to</label>
        <select id="reassign-target" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={chosen()} onChange={(e) => setTargetId(e.currentTarget.value)}>
          <For each={targets.data?.targets}>{(t) => <option value={t.id}>{t.email}</option>}</For>
        </select>
        <Show when={targets.data && targets.data.targets.length === 0}>
          <p class="mt-1 text-xs text-red-700">No active {props.kind === "admins" ? "admin" : "operator"} to move to; create one first.</p>
        </Show>
      </div>
      <ErrorNote message={error()} />
      <div class="flex gap-2">
        <Button type="submit" icon="i-tabler-arrows-exchange" busy={busy()} disabled={!chosen()}>Reassign</Button>
        <Button type="button" variant="secondary" onClick={props.onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
