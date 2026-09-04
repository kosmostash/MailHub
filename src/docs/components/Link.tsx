import { h, type JSX } from "preact";

import { pageRouteMap, type LinkProps } from "_/core";

export default function Link(
  props: Omit<h.JSX.IntrinsicElements["a"], "href"> & {
    to: LinkProps;
    query?: Record<string | number, unknown>;
  },
): JSX.Element {
  const { to, query, children, ...restProps } = props;

  const [key, ...params] = to;
  const href = pageRouteMap[key]?.path(params as never, query);

  return h("a", { ...restProps, href }, children);
}
