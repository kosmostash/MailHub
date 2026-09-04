import { useNavigate, useParams } from "@solidjs/router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, Show } from "solid-js";

import { CollectionForm } from "~/components/CollectionForm";
import { EmailList } from "~/components/EmailList";
import { Button, ErrorNote, formatDate } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";
import { useMe } from "~/lib/session";

/**
 * One collection (spec §5.3, §5.4): settings, the API key, deletion, and the email list.
 * */
export default function CollectionPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useMe();
  const canEdit = () => me.data?.actor.role === "operator";

  const collection = useQuery(() => ({
    queryKey: ["collection", params.id],
    queryFn: () => api["collections/[id]"].GET([params.id]),
  }));

  const [editing, setEditing] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["collection", params.id] });
    await client.invalidateQueries({ queryKey: ["collections"] });
  };

  const copyKey = async () => {
    await navigator.clipboard.writeText(params.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const remove = async () => {
    const c = collection.data?.collection;
    if (!c) return;
    const total = c.counters.total;
    if (!window.confirm(`Delete "${c.name}" and its ${total} email${total === 1 ? "" : "s"}? This cannot be undone.`)) {
      return;
    }
    setError(null);
    try {
      await api["collections/[id]"].DELETE([params.id]);
      await client.invalidateQueries({ queryKey: ["collections"] });
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Show when={collection.data?.collection} fallback={<p class="text-gray-500">Loading…</p>}>
      {(c) => (
        <div>
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold">{c().name}</h1>
              <p class="text-sm text-gray-600">
                {c().operator.email} · {c().scheduleMode === "immediate" ? "immediate" : "after review"} ·{" "}
                <Show when={c().provider} fallback={<span class="text-orange-700">no provider</span>}>
                  {(p) => `${p().name} (${p().type})`}
                </Show>
              </p>
            </div>
            <Show when={canEdit()}>
              <div class="flex gap-2">
                <Button variant="secondary" icon="i-tabler-settings" onClick={() => setEditing(!editing())}>
                  Settings
                </Button>
                <Button variant="danger" icon="i-tabler-trash" onClick={remove}>
                  Delete
                </Button>
              </div>
            </Show>
          </div>
          <ErrorNote message={error()} />

          <div class="card mb-4 flex flex-wrap items-center gap-3 text-sm">
            <span class="font-medium text-gray-700">API key</span>
            <code class="rounded bg-gray-100 px-2 py-1 font-mono text-xs">{c().id}</code>
            <Button variant="secondary" icon={copied() ? "i-tabler-check" : "i-tabler-copy"} onClick={copyKey}>
              {copied() ? "Copied" : "Copy"}
            </Button>
            <span class="text-xs text-gray-500">
              Send it as the <code>x-collection-id</code> header, or as the SMTP password.
            </span>
          </div>

          <Show when={editing()}>
            <div class="card mb-4 max-w-lg">
              <h2 class="mb-3 font-semibold">Settings</h2>
              <CollectionForm
                initial={{ name: c().name, scheduleMode: c().scheduleMode, providerId: c().provider?.id ?? null }}
                submitLabel="Save"
                submit={async (values) => {
                  await api["collections/[id]"].PATCH([params.id], { json: values });
                  setEditing(false);
                  await refresh();
                }}
                onCancel={() => setEditing(false)}
              />
            </div>
          </Show>

          <div class="card mb-4 text-sm text-gray-600">
            <div class="mb-2 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
              <Counter label="total" value={c().counters.total} />
              <Counter label="pending" value={c().counters.pending} />
              <Counter label="ready" value={c().counters.ready} />
              <Counter label="sent" value={c().counters.sent} />
              <Counter label="delivered" value={c().counters.delivered} />
              <Counter label="bounced" value={c().counters.bounced} />
            </div>
            <p class="text-xs text-gray-500">Created {formatDate(c().createdAt)}.</p>
          </div>

          <EmailList collectionId={c().id} />
        </div>
      )}
    </Show>
  );
}

function Counter(props: { label: string; value: number }) {
  return (
    <div>
      <div class="text-lg font-semibold tabular-nums text-gray-900">{props.value}</div>
      <div class="text-xs uppercase tracking-wide">{props.label}</div>
    </div>
  );
}
