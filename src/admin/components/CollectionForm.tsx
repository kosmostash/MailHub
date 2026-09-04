import { useQuery } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";

import { api, errorMessage } from "~/lib/api";
import { Button, ErrorNote, Field } from "./ui";

type Values = { name: string; scheduleMode: "after_review" | "immediate"; providerId: string | null };

/** Create or edit a collection (spec §5.3): name, schedule mode, one of the admin's providers. */
export function CollectionForm(props: {
  initial?: Partial<Values>;
  submitLabel: string;
  submit: (values: Values) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const providers = useQuery(() => ({
    queryKey: ["providers"],
    queryFn: () => api["providers"].GET(),
  }));
  const [name, setName] = createSignal(props.initial?.name ?? "");
  const [scheduleMode, setScheduleMode] = createSignal<Values["scheduleMode"]>(
    props.initial?.scheduleMode ?? "after_review",
  );
  const [providerId, setProviderId] = createSignal<string | null>(props.initial?.providerId ?? null);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await props.submit({ name: name(), scheduleMode: scheduleMode(), providerId: providerId() });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="flex flex-col gap-3" onSubmit={onSubmit}>
      <Field label="Name" value={name()} onInput={setName} placeholder="my-project" />
      <fieldset>
        <legend class="mb-1 text-sm font-medium text-gray-700">Schedule</legend>
        <label class="flex items-start gap-2 text-sm">
          <input type="radio" name="scheduleMode" class="mt-1" checked={scheduleMode() === "after_review"} onChange={() => setScheduleMode("after_review")} />
          <span><strong>After review</strong> <span class="text-gray-600">– submissions wait for a human to approve them</span></span>
        </label>
        <label class="flex items-start gap-2 text-sm">
          <input type="radio" name="scheduleMode" class="mt-1" checked={scheduleMode() === "immediate"} onChange={() => setScheduleMode("immediate")} />
          <span><strong>Immediate</strong> <span class="text-gray-600">– submissions are sent as soon as the sender gets to them</span></span>
        </label>
      </fieldset>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700" for="collection-provider">
          Provider
        </label>
        <select
          id="collection-provider"
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
          value={providerId() ?? ""}
          onChange={(e) => setProviderId(e.currentTarget.value || null)}
        >
          <option value="">No provider (store only, cannot send)</option>
          <For each={providers.data?.providers}>
            {(p) => (
              <option value={p.id}>
                {p.name} ({p.type})
              </option>
            )}
          </For>
        </select>
        <Show when={providers.data && providers.data.providers.length === 0}>
          <p class="mt-1 text-xs text-gray-500">Your admin has not configured any providers yet.</p>
        </Show>
        <Show when={providers.error}>
          {(err) => <p class="mt-1 text-xs text-red-700">Could not load providers: {errorMessage(err())}</p>}
        </Show>
      </div>
      <ErrorNote message={error()} />
      <div class="flex gap-2">
        <Button type="submit" icon="i-tabler-check" busy={busy()}>
          {props.submitLabel}
        </Button>
        <Show when={props.onCancel}>
          <Button type="button" variant="secondary" onClick={props.onCancel}>
            Cancel
          </Button>
        </Show>
      </div>
    </form>
  );
}
