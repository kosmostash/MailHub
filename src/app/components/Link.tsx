import {
  type LinkProps as RouterLinkProps,
  Link as RouterLink,
} from "react-router";
import type { ReactNode } from "react";

import { pageRouteMap, type LinkProps } from "_/core";

export default function Link(
  props: Omit<RouterLinkProps, "to"> & {
    to: LinkProps;
    query?: Record<string | number, unknown>;
    children: ReactNode;
  },
) {
  const { to, query, children, ...restProps } = props;

  const href = () => {
    const [key, ...params] = to;
    return pageRouteMap[key]?.path(params as never, query, { prefix: false });
  };

  return (
    <RouterLink {...restProps} to={href()}>
      {children}
    </RouterLink>
  );
}
