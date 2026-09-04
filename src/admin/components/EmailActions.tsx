import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";

import Link from "~/components/Link";
import { api, errorMessage } from "~/lib/api";
import { useMe } from "~/lib/session";
import { Button, ErrorNote } from "./ui";

type Email = { id: string; collectionId: string; state: "pending" | "ready" | "sent" };

/**
 * Approve, Send, Send to me (spec §5.5, §4.2, §4.4). Rendered for operators and for
 * overseers impersonating one; the API refuses everyone else regardless.
 * */
export function EmailActions(props: { email: Email }) {
  const me = useMe();
  const client = useQueryClient();
  const canAct = () => me.data?.actor.role === "operator";
  const [error, setError] = createSignal<string | null>(null);
  const [note, setNote] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);

  const testAddresses = useQuery(() => ({
    queryKey: ["test-addresses"],
    queryFn: () => api["account/test-addresses"].GET(),
    enabled: canAct(),
  }));
  const [testAddressId, setTestAddressId] = createSignal<string>("");
  const chosen = () => testAddressId() || testAddresses.data?.testAddresses[0]?.id || "";

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["email", props.email.id] });
    await client.invalidateQueries({ queryKey: ["emails", props.email.collectionId] });
    await client.invalidateQueries({ queryKey: ["collection", props.email.collectionId] });
    await client.invalidateQueries({ queryKey: ["collections"] });
  };

  const run = async (name: string, fn: () => Promise<string | null>) => {
    setBusy(name);
    setError(null);
    setNote(null);
    try {
      setNote(await fn());
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const approve = () =>
    run("approve", async () => {
      await api["emails/[id]/approve"].POST([props.email.id]);
      return "Approved: the email is ready to send.";
    });

  const send = () =>
    run("send", async () => {
      const { outcomes } = await api["emails/send"].POST([], { json: { ids: [props.email.id] } });
      const outcome = outcomes[0];
      if (!outcome || !outcome.ok) {
        throw Object.assign(new Error(outcome && "message" in outcome ? outcome.message : "Send failed"), {});
      }
      return "Sent: the provider accepted the email.";
    });

  const sendToMe = () =>
    run("test", async () => {
      const { sentTo } = await api["emails/[id]/send-to-me"].POST([props.email.id], { json: { testAddressId: chosen() } });
      return `A [test] copy went to ${sentTo}. The stored email is unchanged.`;
    });

  return (
    <Show when={canAct()}>
      <div class="card mb-4 flex flex-wrap items-center gap-3">
        <Show when={props.email.state === "pending"}>
          <Button icon="i-tabler-check" busy={busy() === "approve"} onClick={approve}>
            Approve
          </Button>
        </Show>
        <Show when={props.email.state === "ready"}>
          <Button icon="i-tabler-send" busy={busy() === "send"} onClick={send}>
            Send
          </Button>
        </Show>
        <span class="mx-1 h-6 border-l border-gray-200" />
        <Show
          when={testAddresses.data?.testAddresses.length}
          fallback={
            <span class="text-sm text-gray-600">
              <Show when={testAddresses.data}>
                Send to me needs a test address:{" "}
                <Link to={["account"]} class="text-blue-700 underline">
                  add one in Account
                </Link>
                .
              </Show>
            </span>
          }
        >
          <label class="flex items-center gap-2 text-sm">
            <span class="text-gray-600">Send to</span>
            <select class="rounded-md border border-gray-300 px-2 py-1" value={chosen()} onChange={(e) => setTestAddressId(e.currentTarget.value)}>
              <For each={testAddresses.data?.testAddresses}>
                {(t) => <option value={t.id}>{t.label ? `${t.label} <${t.address}>` : t.address}</option>}
              </For>
            </select>
          </label>
          <Button variant="secondary" icon="i-tabler-mail-forward" busy={busy() === "test"} onClick={sendToMe}>
            Send to me
          </Button>
        </Show>
        <div class="basis-full">
          <ErrorNote message={error()} />
          <Show when={note()}>
            <p class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800" role="status">{note()}</p>
          </Show>
        </div>
      </div>
    </Show>
  );
}
