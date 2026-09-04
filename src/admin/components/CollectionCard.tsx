import { Show } from "solid-js";

import Link from "~/components/Link";

export type CollectionSummary = {
  id: string;
  name: string;
  scheduleMode: "after_review" | "immediate";
  provider: { id: string; name: string; type: string } | null;
  operator: { id: string; email: string; adminId: string };
  counters: { total: number; pending: number; ready: number; sent: number; delivered: number; bounced: number };
};

/** One dashboard card per collection (spec §5.2): name, schedule mode, live counts. */
export function CollectionCard(props: { collection: CollectionSummary; showOperator?: boolean }) {
  const c = () => props.collection;
  return (
    <Link to={["collections/[id]", c().id]} class="card block hover:border-blue-300">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="truncate font-semibold">{c().name}</div>
          <Show when={props.showOperator}>
            <div class="truncate text-xs text-gray-500">{c().operator.email}</div>
          </Show>
        </div>
        <span class={c().scheduleMode === "immediate" ? "pill-ready" : "pill-muted"}>
          {c().scheduleMode === "immediate" ? "immediate" : "after review"}
        </span>
      </div>
      <div class="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <Stat label="total" value={c().counters.total} />
        <Stat label="pending" value={c().counters.pending} tone={c().counters.pending ? "text-orange-700" : ""} />
        <Stat label="ready" value={c().counters.ready} tone={c().counters.ready ? "text-blue-700" : ""} />
        <Stat label="sent" value={c().counters.sent} />
        <Stat label="delivered" value={c().counters.delivered} tone={c().counters.delivered ? "text-green-700" : ""} />
        <Stat label="bounced" value={c().counters.bounced} tone={c().counters.bounced ? "text-red-700" : ""} />
      </div>
      <div class="mt-3 flex items-center gap-1 text-xs text-gray-500">
        <span class="i-tabler-send" aria-hidden="true" />
        <Show when={c().provider} fallback={<span class="text-orange-700">no provider, cannot send</span>}>
          {(p) => (
            <span>
              {p().name} <span class="text-gray-400">({p().type})</span>
            </span>
          )}
        </Show>
      </div>
    </Link>
  );
}

function Stat(props: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div class={`text-lg font-semibold tabular-nums ${props.tone ?? ""}`}>{props.value}</div>
      <div class="text-xs uppercase tracking-wide text-gray-500">{props.label}</div>
    </div>
  );
}
