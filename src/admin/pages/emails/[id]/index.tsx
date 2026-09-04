import { useParams } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";

import { EmailActions } from "~/components/EmailActions";
import { deliveryPill, statePill } from "~/components/EmailList";
import Link from "~/components/Link";
import { formatDate, Pill } from "~/components/ui";
import { api } from "~/lib/api";

type Address = { address: string; name?: string };
const fmt = (a: Address) => (a.name ? `${a.name} <${a.address}>` : a.address);

/**
 * Everything about one email (spec §5.5). The HTML body renders in a sandboxed iframe:
 * stored content is untrusted and never runs in the application's origin.
 * */
export default function EmailPage() {
  const params = useParams<{ id: string }>();
  const email = useQuery(() => ({
    queryKey: ["email", params.id],
    queryFn: () => api["emails/[id]"].GET([params.id]),
  }));
  const [tab, setTab] = createSignal<"preview" | "html" | "text">("preview");

  return (
    <Show when={email.data?.email} fallback={<p class="text-gray-500">Loading…</p>}>
      {(e) => (
        <div>
          <div class="mb-1 text-sm">
            <Link to={["collections/[id]", e().collectionId]} class="text-blue-700 hover:underline">
              <span class="i-tabler-arrow-left" aria-hidden="true" /> Back to collection
            </Link>
          </div>
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h1 class="truncate text-xl font-semibold">{e().subject || <span class="text-gray-400">(no subject)</span>}</h1>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <Pill kind={statePill(e().state)}>{e().state}</Pill>
                <Pill kind={deliveryPill(e().deliveryStatus)}>delivery: {e().deliveryStatus}</Pill>
                <span class="text-gray-500">via {e().source}</span>
              </div>
            </div>
          </div>

          <EmailActions email={e()} />

          <div class="grid gap-4 lg:grid-cols-3">
            <div class="card lg:col-span-1">
              <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                <dt class="text-gray-500">From</dt><dd class="break-all">{fmt(e().from)}</dd>
                <dt class="text-gray-500">To</dt><dd class="break-all"><For each={e().to}>{(a) => <div>{fmt(a)}</div>}</For></dd>
                <Show when={e().cc.length}><dt class="text-gray-500">Cc</dt><dd class="break-all"><For each={e().cc}>{(a) => <div>{fmt(a)}</div>}</For></dd></Show>
                <Show when={e().bcc.length}><dt class="text-gray-500">Bcc</dt><dd class="break-all"><For each={e().bcc}>{(a) => <div>{fmt(a)}</div>}</For></dd></Show>
                <dt class="text-gray-500">Received</dt><dd>{formatDate(e().createdAt)}</dd>
                <dt class="text-gray-500">Reviewed</dt><dd>{formatDate(e().reviewedAt)}</dd>
                <dt class="text-gray-500">Sent</dt><dd>{formatDate(e().sentAt)}</dd>
                <dt class="text-gray-500">Attempts</dt><dd class="tabular-nums">{e().attempts}</dd>
                <Show when={e().providerMessageId}><dt class="text-gray-500">Message id</dt><dd class="break-all font-mono text-xs">{e().providerMessageId}</dd></Show>
                <Show when={e().lastError}><dt class="text-gray-500">Last error</dt><dd class="break-words text-red-700">{e().lastError}</dd></Show>
                <dt class="text-gray-500">Id</dt><dd class="break-all font-mono text-xs">{e().id}</dd>
              </dl>
            </div>

            <div class="card lg:col-span-2 p-0">
              <div class="flex gap-1 border-b border-gray-200 px-2 pt-2 text-sm">
                <For each={[["preview", "Preview"], ["html", "HTML"], ["text", "Text"]] as const}>
                  {([key, label]) => (
                    <button
                      class={`rounded-t-md px-3 py-1.5 ${tab() === key ? "bg-gray-100 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                      onClick={() => setTab(key)}
                    >
                      {label}
                    </button>
                  )}
                </For>
              </div>
              <Show when={tab() === "preview"}>
                <Show when={e().html} fallback={<pre class="whitespace-pre-wrap p-4 text-sm">{e().text}</pre>}>
                  {(html) => (
                    <iframe
                      title="Email preview"
                      class="h-[32rem] w-full bg-white"
                      sandbox=""
                      referrerPolicy="no-referrer"
                      srcdoc={html()}
                    />
                  )}
                </Show>
              </Show>
              <Show when={tab() === "html"}>
                <pre class="max-h-[32rem] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs">{e().html ?? "(no html body)"}</pre>
              </Show>
              <Show when={tab() === "text"}>
                <pre class="max-h-[32rem] overflow-auto whitespace-pre-wrap p-4 text-sm">{e().text ?? "(no text body)"}</pre>
              </Show>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
