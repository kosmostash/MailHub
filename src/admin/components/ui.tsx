import { type JSX, Show, splitProps } from "solid-js";

export function Field(props: {
  label: string;
  type?: string;
  value: string;
  onInput: (value: string) => void;
  autocomplete?: string;
  required?: boolean;
  minlength?: number;
  placeholder?: string;
}) {
  return (
    <label class="block">
      <span class="mb-1 block text-sm font-medium text-gray-700">{props.label}</span>
      <input
        class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
        type={props.type ?? "text"}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        autocomplete={props.autocomplete}
        required={props.required ?? true}
        minlength={props.minlength}
        placeholder={props.placeholder}
      />
    </label>
  );
}

export function ErrorNote(props: { message?: string | null }) {
  return (
    <Show when={props.message}>
      <p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        {props.message}
      </p>
    </Show>
  );
}

export function Button(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "danger";
    icon?: string;
    busy?: boolean;
  },
) {
  const [own, rest] = splitProps(props, ["variant", "icon", "busy", "children", "class"]);
  const variant = () =>
    own.variant === "danger" ? "btn-danger" : own.variant === "secondary" ? "btn-secondary" : "btn-primary";
  return (
    <button {...rest} class={`${variant()} ${own.class ?? ""}`} disabled={own.busy || rest.disabled}>
      <Show when={own.icon}>
        <span class={`${own.busy ? "i-tabler-loader-2 animate-spin" : own.icon} text-base`} aria-hidden="true" />
      </Show>
      {own.children}
    </button>
  );
}

// literal class names so UnoCSS can see them
const pillClass = {
  pending: "pill-pending",
  ready: "pill-ready",
  sent: "pill-sent",
  bounced: "pill-bounced",
  muted: "pill-muted",
} as const;

export function Pill(props: { kind: keyof typeof pillClass; children: JSX.Element }) {
  return <span class={pillClass[props.kind]}>{props.children}</span>;
}

export const formatDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString() : "–";
