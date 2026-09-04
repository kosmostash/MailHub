import { Navigate, useLocation } from "@solidjs/router";
import { type ParentComponent, Show } from "solid-js";
import { AppProvider } from "_/app";

import { Shell } from "~/components/Shell";
import { isUnauthenticated } from "~/lib/api";
import { useMe } from "~/lib/session";

/** Wraps every route: query client, then the session guard (spec §5.1) around all but sign-in. */
const App: ParentComponent = (props) => {
  return (
    <AppProvider>
      <Guard>{props.children}</Guard>
    </AppProvider>
  );
};

/** A 401 from /me sends the visitor to sign-in; anything else renders inside the shell. */
const Guard: ParentComponent = (props) => {
  const location = useLocation();
  const isPublic = () => location.pathname.endsWith("/sign-in");

  return (
    <Show when={!isPublic()} fallback={props.children}>
      <Authenticated>{props.children}</Authenticated>
    </Show>
  );
};

const Authenticated: ParentComponent = (props) => {
  const me = useMe();
  return (
    <Show
      when={me.data}
      fallback={
        <Show
          when={me.error}
          fallback={
            <div class="flex h-screen items-center justify-center text-gray-500">
              <span class="i-tabler-loader-2 animate-spin text-2xl" aria-hidden="true" />
            </div>
          }
        >
          {(error) => (
            <Show
              when={isUnauthenticated(error())}
              fallback={<p class="p-6 text-red-800">Could not load your session.</p>}
            >
              <Navigate href="/sign-in" />
            </Show>
          )}
        </Show>
      }
    >
      {(data) => <Shell me={data()}>{props.children}</Shell>}
    </Show>
  );
};

export default App;
