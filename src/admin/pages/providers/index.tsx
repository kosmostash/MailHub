import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";

import { Button, ErrorNote, Field, formatDate } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";

type Provider = {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown> | null;
  collections: number;
};

type FieldInfo = {
  key: string;
  label: string;
  type: "text" | "number" | "password" | "boolean";
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  help?: string;
};

/** Providers (spec §5.6): admin-only CRUD with per-type forms; secrets never echoed. */
export default function ProvidersPage() {
  const client = useQueryClient();
  const providers = useQuery(() => ({ queryKey: ["providers"], queryFn: () => api["providers"].GET() }));
  const types = useQuery(() => ({ queryKey: ["provider-types"], queryFn: () => api["provider-types"].GET() }));
  const [editing, setEditing] = createSignal<Provider | "new" | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const refresh = () => client.invalidateQueries({ queryKey: ["providers"] });

  const remove = async (p: Provider) => {
    if (!window.confirm(`Delete provider "${p.name}"?`)) return;
    setError(null);
    try {
      await api["providers/[id]"].DELETE([p.id]);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div>
      <div class="mb-4 flex items-center justify-between gap-4">
        <h1 class="text-xl font-semibold">Providers</h1>
        <Button icon="i-tabler-plus" onClick={() => setEditing("new")}>
          New provider
        </Button>
      </div>
      <p class="mb-4 max-w-prose text-sm text-gray-600">
        Every provider here is available to all of your operators. Credentials are stored encrypted and never shown again.
      </p>
      <ErrorNote message={error()} />

      <Show when={editing()} keyed>
        {(target) => (
          <ProviderForm
            types={types.data?.types ?? []}
            provider={target === "new" ? null : target}
            onDone={async () => {
              setEditing(null);
              await refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Show>

      <div class="card mt-4 overflow-x-auto p-0">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th class="px-4 py-2">Name</th>
              <th class="px-4 py-2">Type</th>
              <th class="px-4 py-2">Configuration</th>
              <th class="px-4 py-2 text-right">Collections</th>
              <th class="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For
              each={providers.data?.providers}
              fallback={
                <tr>
                  <td class="px-4 py-6 text-center text-gray-500" colSpan={5}>
                    <Show when={providers.isPending} fallback="No providers yet.">Loading…</Show>
                  </td>
                </tr>
              }
            >
              {(p) => (
                <tr class="border-t border-gray-100">
                  <td class="px-4 py-2 font-medium">{p.name}</td>
                  <td class="px-4 py-2 uppercase text-gray-600">{p.type}</td>
                  <td class="px-4 py-2 font-mono text-xs text-gray-600">
                    {p.config ? `${p.config.host}:${p.config.port}${p.config.secure ? " tls" : ""}${p.config.user ? ` as ${p.config.user}` : ""}` : ""}
                  </td>
                  <td class="px-4 py-2 text-right tabular-nums">{p.collections}</td>
                  <td class="px-4 py-2">
                    <div class="flex justify-end gap-2">
                      <Button variant="secondary" icon="i-tabler-edit" onClick={() => setEditing(p)}>Edit</Button>
                      <Button variant="danger" icon="i-tabler-trash" onClick={() => remove(p)}>Delete</Button>
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

function ProviderForm(props: {
  types: Array<{ type: string; label: string; fields: Array<FieldInfo> }>;
  provider: Provider | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = createSignal(props.provider?.name ?? "");
  const [type, setType] = createSignal(props.provider?.type ?? props.types[0]?.type ?? "smtp");
  const [config, setConfig] = createSignal<Record<string, unknown>>({ ...(props.provider?.config ?? {}) });
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const fields = () => props.types.find((t) => t.type === type())?.fields ?? [];
  const set = (key: string, value: unknown) => setConfig({ ...config(), [key]: value });

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (props.provider) {
        await api["providers/[id]"].PATCH([props.provider.id], { json: { name: name(), config: config() } });
      } else {
        await api["providers"].POST([], { json: { name: name(), type: type(), config: config() } });
      }
      await props.onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="card mt-2 flex max-w-lg flex-col gap-3" onSubmit={submit}>
      <h2 class="font-semibold">{props.provider ? `Edit ${props.provider.name}` : "New provider"}</h2>
      <Field label="Name" value={name()} onInput={setName} placeholder="Main SMTP" />
      <Show when={!props.provider}>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700" for="provider-type">
            Type
          </label>
          <select id="provider-type" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={type()} onChange={(e) => { setType(e.currentTarget.value); setConfig({}); }}>
            <For each={props.types}>{(t) => <option value={t.type}>{t.label}</option>}</For>
          </select>
        </div>
      </Show>
      <For each={fields()}>
        {(f) => (
          <Show
            when={f.type !== "boolean"}
            fallback={
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(config()[f.key])} onChange={(e) => set(f.key, e.currentTarget.checked)} />
                {f.label}
              </label>
            }
          >
            <label class="block">
              <span class="mb-1 block text-sm font-medium text-gray-700">{f.label}</span>
              <input
                class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                value={String(config()[f.key] ?? "")}
                placeholder={f.placeholder}
                required={f.required}
                autocomplete={f.type === "password" ? "new-password" : "off"}
                onInput={(e) => set(f.key, f.type === "number" ? Number(e.currentTarget.value) : e.currentTarget.value)}
              />
              <Show when={f.help}>
                <span class="mt-1 block text-xs text-gray-500">{f.help}</span>
              </Show>
              <Show when={f.secret && props.provider}>
                <span class="mt-1 block text-xs text-gray-500">Leave the dots in place to keep the stored value.</span>
              </Show>
            </label>
          </Show>
        )}
      </For>
      <ErrorNote message={error()} />
      <div class="flex gap-2">
        <Button type="submit" icon="i-tabler-check" busy={busy()}>{props.provider ? "Save" : "Create"}</Button>
        <Button type="button" variant="secondary" onClick={props.onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
