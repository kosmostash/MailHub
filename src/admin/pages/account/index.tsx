import { useNavigate } from "@solidjs/router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";

import { Button, ErrorNote, Field, formatDate } from "~/components/ui";
import { api, errorMessage } from "~/lib/api";
import { meKey, useMe, useResetSession } from "~/lib/session";

/**
 * Account (spec §5.10): own email and password behind the confirmation gate (spec §2.1.7),
 * an optional second factor, and test addresses for operators (spec §2.5).
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
      <div class="grid gap-4 xl:grid-cols-2">
        <Show when={me.data?.actor.role === "operator"}>
          <TestAddresses />
        </Show>
        <Show when={me.data && !me.data.impersonating}>
          <ChangeEmail current={me.data!.principal.email} totp={me.data!.principal.totpEnabled} />
          <ChangePassword totp={me.data!.principal.totpEnabled} />
          <SecondFactor enabled={me.data!.principal.totpEnabled} />
        </Show>
        <Show when={me.data?.impersonating}>
          <div class="card max-w-lg text-sm text-gray-600">
            <h2 class="mb-1 font-semibold text-gray-900">Email, password and second factor</h2>
            <p>These are personal to your own account. End impersonation to change them.</p>
          </div>
        </Show>
      </div>
    </div>
  );
}

/** Two steps: request (a code goes out, or the authenticator is asked), then confirm. */
function ConfirmedChange(props: {
  title: string;
  description: string;
  totp: boolean;
  request: () => Promise<{ method: "totp" | "email"; sentTo: string | null }>;
  confirm: (code: string) => Promise<string>;
  children: (busy: boolean) => import("solid-js").JSX.Element;
}) {
  const [pending, setPending] = createSignal<{ method: "totp" | "email"; sentTo: string | null } | null>(null);
  const [code, setCode] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const request = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setPending(await props.request());
      setCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setNotice(await props.confirm(code()));
      setPending(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="card max-w-lg">
      <h2 class="mb-1 font-semibold">{props.title}</h2>
      <p class="mb-3 text-sm text-gray-600">{props.description}</p>
      <Show
        when={pending()}
        fallback={
          <form class="flex flex-col gap-2" onSubmit={request}>
            {props.children(busy())}
            <ErrorNote message={error()} />
            <Show when={notice()}>
              <p class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800" role="status">{notice()}</p>
            </Show>
            <div>
              <Button type="submit" icon="i-tabler-shield-lock" busy={busy()}>
                {props.totp ? "Continue with authenticator" : "Send confirmation code"}
              </Button>
            </div>
          </form>
        }
      >
        {(p) => (
          <form class="flex flex-col gap-2" onSubmit={confirm}>
            <p class="text-sm text-gray-700" role="status">
              <Show when={p().method === "email"} fallback="Enter the code from your authenticator app.">
                A code was sent to <strong>{p().sentTo}</strong>. It expires in 10 minutes.
              </Show>
            </p>
            <Field label="Confirmation code" value={code()} onInput={setCode} autocomplete="one-time-code" placeholder="123456" />
            <ErrorNote message={error()} />
            <div class="flex gap-2">
              <Button type="submit" icon="i-tabler-check" busy={busy()}>Confirm</Button>
              <Button type="button" variant="secondary" onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </form>
        )}
      </Show>
    </div>
  );
}

function ChangeEmail(props: { current: string; totp: boolean }) {
  const client = useQueryClient();
  const [newEmail, setNewEmail] = createSignal("");
  return (
    <ConfirmedChange
      title="Email address"
      description={`Currently ${props.current}. The code goes to the new address, proving you control it; the change applies only once confirmed.`}
      totp={props.totp}
      request={async () => (await api["account/email"].POST([], { json: { newEmail: newEmail() } })).confirmation}
      confirm={async (code) => {
        const { user } = await api["account/email/confirm"].POST([], { json: { code } });
        setNewEmail("");
        await client.invalidateQueries({ queryKey: meKey });
        return `Your address is now ${user.email}.`;
      }}
    >
      {() => <Field label="New email" type="email" value={newEmail()} onInput={setNewEmail} autocomplete="email" />}
    </ConfirmedChange>
  );
}

function ChangePassword(props: { totp: boolean }) {
  const [newPassword, setNewPassword] = createSignal("");
  return (
    <ConfirmedChange
      title="Password"
      description="The code goes to your current address. Other sessions of your account are signed out when the new password applies."
      totp={props.totp}
      request={async () => (await api["account/password"].POST([], { json: { newPassword: newPassword() } })).confirmation}
      confirm={async (code) => {
        await api["account/password/confirm"].POST([], { json: { code } });
        setNewPassword("");
        return "Your password is changed.";
      }}
    >
      {() => <Field label="New password" type="password" value={newPassword()} onInput={setNewPassword} autocomplete="new-password" minlength={8} />}
    </ConfirmedChange>
  );
}

function SecondFactor(props: { enabled: boolean }) {
  const client = useQueryClient();
  const [enrolment, setEnrolment] = createSignal<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
      await client.invalidateQueries({ queryKey: meKey });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="card max-w-lg">
      <h2 class="mb-1 font-semibold">Second factor</h2>
      <p class="mb-3 text-sm text-gray-600">
        With an authenticator app enrolled, sign-in asks for its code and credential changes use it instead of an emailed code.
      </p>
      <Show
        when={props.enabled}
        fallback={
          <Show
            when={enrolment()}
            fallback={
              <div>
                <Button icon="i-tabler-shield-plus" busy={busy()} onClick={() => run(async () => { setEnrolment(await api["account/totp"].POST()); return null; })}>
                  Enable second factor
                </Button>
              </div>
            }
          >
            {(e) => (
              <form class="flex flex-col gap-2" onSubmit={(ev) => { ev.preventDefault(); void run(async () => { await api["account/totp/confirm"].POST([], { json: { code: code() } }); setEnrolment(null); return "Second factor enabled."; }); }}>
                <p class="text-sm text-gray-700">Add this secret to your authenticator app, then enter the code it shows.</p>
                <code class="break-all rounded bg-gray-100 px-2 py-1 font-mono text-sm">{e().secret}</code>
                <a class="break-all text-xs text-blue-700 underline" href={e().uri}>Open in an authenticator app</a>
                <Field label="Code from the app" value={code()} onInput={setCode} autocomplete="one-time-code" placeholder="123456" />
                <div class="flex gap-2">
                  <Button type="submit" icon="i-tabler-check" busy={busy()}>Confirm enrolment</Button>
                  <Button type="button" variant="secondary" onClick={() => setEnrolment(null)}>Cancel</Button>
                </div>
              </form>
            )}
          </Show>
        }
      >
        <form class="flex flex-col gap-2" onSubmit={(ev) => { ev.preventDefault(); void run(async () => { await api["account/totp"].DELETE([], { json: { code: code() } }); return "Second factor disabled."; }); }}>
          <p class="text-sm text-green-800"><span class="i-tabler-shield-check" aria-hidden="true" /> Enabled.</p>
          <Field label="Code from the app, to disable" value={code()} onInput={setCode} autocomplete="one-time-code" placeholder="123456" />
          <div>
            <Button type="submit" variant="danger" icon="i-tabler-shield-off" busy={busy()}>Disable second factor</Button>
          </div>
        </form>
      </Show>
      <ErrorNote message={error()} />
      <Show when={notice()}>
        <p class="mt-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800" role="status">{notice()}</p>
      </Show>
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

  void useNavigate;
  void useResetSession;
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
