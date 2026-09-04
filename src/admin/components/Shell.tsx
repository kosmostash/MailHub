import { A, useNavigate } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";

import type { Me } from "~/api/me";
import { api } from "~/lib/api";
import { useResetSession } from "~/lib/session";
import { Button } from "./ui";

type NavItem = { href: string; label: string; icon: string };

const navFor = (me: Me): Array<NavItem> => {
  switch (me.actor.role) {
    case "superadmin":
      return [{ href: "/admins", label: "Admins", icon: "i-tabler-users-group" }];
    case "admin":
      return [
        { href: "/", label: "Dashboard", icon: "i-tabler-layout-dashboard" },
        { href: "/operators", label: "Operators", icon: "i-tabler-users" },
      ];
    default:
      return [{ href: "/", label: "Dashboard", icon: "i-tabler-layout-dashboard" }];
  }
};

/** Sidebar, impersonation banner (spec §2.2) and the page area. */
export function Shell(props: { me: Me; children: JSX.Element }) {
  const navigate = useNavigate();
  const resetSession = useResetSession();

  const signOut = async () => {
    await api["auth/sign-out"].POST();
    await resetSession();
    navigate("/sign-in", { replace: true });
  };

  const endImpersonation = async () => {
    await api["impersonation"].DELETE();
    await resetSession();
    navigate("/", { replace: true });
  };

  return (
    <div class="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <Show when={props.me.impersonating}>
        <div class="flex items-center justify-between gap-4 bg-amber-100 px-4 py-2 text-sm text-amber-900" role="status">
          <span class="flex items-center gap-2">
            <span class="i-tabler-mask text-lg" aria-hidden="true" />
            Acting as <strong>{props.me.actor.email}</strong> ({props.me.actor.role}), impersonated by{" "}
            {props.me.principal.email}
          </span>
          <Button variant="secondary" icon="i-tabler-arrow-back-up" onClick={endImpersonation}>
            End impersonation
          </Button>
        </div>
      </Show>
      <div class="flex flex-1">
        <aside class="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
          <div class="flex items-center gap-2 px-4 py-4 text-lg font-semibold">
            <span class="i-tabler-mailbox text-2xl text-blue-700" aria-hidden="true" />
            MailHub
          </div>
          <nav class="flex flex-1 flex-col gap-1 px-2">
            <For each={navFor(props.me)}>
              {(item) => (
                <A
                  href={item.href}
                  end={item.href === "/"}
                  class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  activeClass="bg-blue-50 text-blue-800 font-medium"
                >
                  <span class={`${item.icon} text-lg`} aria-hidden="true" />
                  {item.label}
                </A>
              )}
            </For>
          </nav>
          <div class="border-t border-gray-200 px-4 py-3 text-xs text-gray-600">
            <div class="truncate font-medium text-gray-800" title={props.me.principal.email}>
              {props.me.principal.email}
            </div>
            <div class="mb-2 capitalize">{props.me.principal.role}</div>
            <button class="flex items-center gap-1 text-gray-700 hover:text-gray-900" onClick={signOut}>
              <span class="i-tabler-logout" aria-hidden="true" /> Sign out
            </button>
          </div>
        </aside>
        <main class="min-w-0 flex-1 p-6">{props.children}</main>
      </div>
    </div>
  );
}
