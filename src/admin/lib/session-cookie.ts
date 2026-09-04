import { deleteCookie, type H3Event, getCookie, setCookie } from "h3";

import { env } from "@/domain/env";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/domain/sessions";

const options = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.isProduction,
  path: "/",
});

export const readSessionCookie = (event: H3Event): string | undefined =>
  getCookie(event, SESSION_COOKIE);

export const writeSessionCookie = (event: H3Event, token: string): void => {
  setCookie(event, SESSION_COOKIE, token, { ...options(), maxAge: SESSION_TTL_MS / 1000 });
};

export const clearSessionCookie = (event: H3Event): void => {
  deleteCookie(event, SESSION_COOKIE, options());
};
