import { useNavigate } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { createSignal, Show } from "solid-js";

import { Button, ErrorNote, Field } from "~/components/ui";
import { api, errorCode, errorMessage } from "~/lib/api";
import { useResetSession } from "~/lib/session";

/**
 * Sign-in for every role, or - on a fresh install with no superadmin - the one-time
 * proposal to create it (spec §2.1.4, §5.1).
 * */
export default function SignInPage() {
  const bootstrap = useQuery(() => ({
    queryKey: ["bootstrap"],
    queryFn: () => api["auth/bootstrap"].GET(),
    staleTime: 0,
  }));

  return (
    <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div class="w-full max-w-sm">
        <div class="mb-6 flex items-center justify-center gap-2 text-2xl font-semibold text-gray-900">
          <span class="i-tabler-mailbox text-3xl text-blue-700" aria-hidden="true" />
          MailHub
        </div>
        <Show when={bootstrap.data} fallback={<p class="text-center text-gray-500">Loading…</p>}>
          {(data) => (
            <Show when={data().needed} fallback={<SignInForm />}>
              <BootstrapForm />
            </Show>
          )}
        </Show>
      </div>
    </div>
  );
}

function CredentialsForm(props: {
  title: string;
  hint?: string;
  submitLabel: string;
  minPassword: number;
  submit: (input: { email: string; password: string; totpCode?: string }) => Promise<unknown>;
  withTotp?: boolean;
}) {
  const navigate = useNavigate();
  const resetSession = useResetSession();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [totpCode, setTotpCode] = createSignal("");
  const [needsTotp, setNeedsTotp] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await props.submit({ email: email(), password: password(), ...(totpCode() ? { totpCode: totpCode() } : {}) });
      await resetSession();
      navigate("/", { replace: true });
    } catch (err) {
      if (props.withTotp && errorCode(err) === "totp_required") {
        // the account has a second factor: ask for the code, keep email and password
        const first = !needsTotp();
        setNeedsTotp(true);
        if (!first) setError(errorMessage(err));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="card flex flex-col gap-4" onSubmit={onSubmit}>
      <div>
        <h1 class="text-lg font-semibold">{props.title}</h1>
        <Show when={props.hint}>
          <p class="mt-1 text-sm text-gray-600">{props.hint}</p>
        </Show>
      </div>
      <Field label="Email" type="email" value={email()} onInput={setEmail} autocomplete="username" />
      <Field
        label="Password"
        type="password"
        value={password()}
        onInput={setPassword}
        autocomplete={props.minPassword > 1 ? "new-password" : "current-password"}
        minlength={props.minPassword}
      />
      <Show when={needsTotp()}>
        <Field
          label="Authenticator code"
          value={totpCode()}
          onInput={setTotpCode}
          autocomplete="one-time-code"
          placeholder="123456"
        />
      </Show>
      <ErrorNote message={error()} />
      <Button type="submit" icon="i-tabler-login-2" busy={busy()}>
        {props.submitLabel}
      </Button>
    </form>
  );
}

function SignInForm() {
  return (
    <CredentialsForm
      title="Sign in"
      submitLabel="Sign in"
      minPassword={1}
      withTotp
      submit={(json) => api["auth/sign-in"].POST([], { json })}
    />
  );
}

function BootstrapForm() {
  return (
    <CredentialsForm
      title="Create the superadmin"
      hint="This installation has no accounts yet. The superadmin oversees admins and is created exactly once."
      submitLabel="Create and sign in"
      minPassword={8}
      submit={(json) => api["auth/bootstrap"].POST([], { json })}
    />
  );
}
