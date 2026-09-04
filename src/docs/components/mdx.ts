/**
 * MDX component overrides.
 *
 * Every standard markdown element (headings, links, code blocks, etc.)
 * can be replaced with a custom Preact component here.
 * These overrides apply globally to all MDX pages via the MDXProvider.
 * Individual pages can still import and use additional components directly.
 *
 * @see https://mdxjs.com/docs/using-mdx/#components
 * */
import type { ComponentType } from "preact";
import Link from "./Link.tsx";

export const components = {
  Link,
  // example overrides:
  // h1: (props) => <h1 style={{ color: "tomato" }} {...props} />,
  // pre: (props) => <pre class="code-block" {...props} />,
} satisfies Record<string, ComponentType<never>>;;

declare global {
  type MDXProvidedComponents = typeof components;
}
