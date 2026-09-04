import { useQuery } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";

import Link from "~/components/Link";
import { api } from "~/lib/api";
import { Button, formatDate, Pill } from "./ui";

type State = "pending" | "ready" | "sent";
type Delivery = "unknown" | "sent" | "delivered" | "bounced";

export const statePill = (state: State) =>
  state === "pending" ? "pending" : state === "ready" ? "ready" : "sent";
export const deliveryPill = (d: Delivery) =>
  d === "delivered" ? "sent" : d === "bounced" ? "bounced" : d === "sent" ? "ready" : "muted";

/**
 * All emails of one collection (spec §5.4): filterable, paginated, pending rows first and
 * marked. Bulk selection and bulk send arrive with Phase 4.
 * */
export function EmailList(props: { collectionId: string }) {
  const [state, setState] = createSignal<State | "">("");
  const [delivery, setDelivery] = createSignal<Delivery | "">("");
  const [page, setPage] = createSignal(1);
  const pageSize = 25;

  const query = () => ({
    ...(state() ? { state: state() as State } : {}),
    ...(delivery() ? { delivery: delivery() as Delivery } : {}),
    page: page(),
    pageSize,
  });

  const emails = useQuery(() => ({
    queryKey: ["emails", props.collectionId, query()],
    queryFn: () => api["collections/[id]/emails"].GET([props.collectionId], { query: query() }),
  }));

  const pages = () => Math.max(1, Math.ceil((emails.data?.total ?? 0) / pageSize));

  return (
    <div>
      <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <label class="flex items-center gap-1">
          <span class="text-gray-600">State</span>
          <select class="rounded-md border border-gray-300 px-2 py-1" value={state()} onChange={(e) => { setState(e.currentTarget.value as State | ""); setPage(1); }}>
            <option value="">all</option>
            <option value="pending">pending</option>
            <option value="ready">ready</option>
            <option value="sent">sent</option>
          </select>
        </label>
        <label class="flex items-center gap-1">
          <span class="text-gray-600">Delivery</span>
          <select class="rounded-md border border-gray-300 px-2 py-1" value={delivery()} onChange={(e) => { setDelivery(e.currentTarget.value as Delivery | ""); setPage(1); }}>
            <option value="">all</option>
            <option value="unknown">unknown</option>
            <option value="sent">sent</option>
            <option value="delivered">delivered</option>
            <option value="bounced">bounced</option>
          </select>
        </label>
        <span class="ml-auto text-gray-500">
          <Show when={emails.data}>{(d) => `${d().total} email${d().total === 1 ? "" : "s"}`}</Show>
        </span>
      </div>

      <div class="card overflow-x-auto p-0">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th class="px-4 py-2">State</th>
              <th class="px-4 py-2">Subject</th>
              <th class="px-4 py-2">To</th>
              <th class="px-4 py-2">Delivery</th>
              <th class="px-4 py-2">Received</th>
            </tr>
          </thead>
          <tbody>
            <For
              each={emails.data?.emails}
              fallback={
                <tr>
                  <td class="px-4 py-6 text-center text-gray-500" colSpan={5}>
                    <Show when={emails.isPending} fallback="No emails match.">Loading…</Show>
                  </td>
                </tr>
              }
            >
              {(email) => (
                <tr class={`border-t border-gray-100 ${email.state === "pending" ? "bg-orange-50" : ""}`}>
                  <td class="px-4 py-2">
                    <Pill kind={statePill(email.state)}>
                      <Show when={email.state === "pending"}>
                        <span class="i-tabler-eye mr-1" aria-hidden="true" />
                      </Show>
                      {email.state}
                    </Pill>
                  </td>
                  <td class="max-w-md truncate px-4 py-2 font-medium">
                    <Link to={["emails/[id]", email.id]} class="hover:underline">
                      {email.subject || <span class="text-gray-400">(no subject)</span>}
                    </Link>
                  </td>
                  <td class="max-w-xs truncate px-4 py-2 text-gray-600">{email.to.map((a) => a.address).join(", ")}</td>
                  <td class="px-4 py-2"><Pill kind={deliveryPill(email.deliveryStatus)}>{email.deliveryStatus}</Pill></td>
                  <td class="px-4 py-2 text-gray-600">{formatDate(email.createdAt)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <Show when={pages() > 1}>
        <div class="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button variant="secondary" icon="i-tabler-chevron-left" disabled={page() <= 1} onClick={() => setPage(page() - 1)}>Previous</Button>
          <span class="tabular-nums text-gray-600">{page()} / {pages()}</span>
          <Button variant="secondary" icon="i-tabler-chevron-right" disabled={page() >= pages()} onClick={() => setPage(page() + 1)}>Next</Button>
        </div>
      </Show>
    </div>
  );
}
