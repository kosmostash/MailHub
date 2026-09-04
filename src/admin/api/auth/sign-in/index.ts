import { defineRoute } from "_/api";

import { type PublicUser, toPublicUser } from "@/domain/accounts/types";
import { signIn } from "@/domain/sessions";
import { writeSessionCookie } from "~/lib/session-cookie";

/** Sign-in for every role alike (spec §5.1). Public. */
export default defineRoute<"auth/sign-in">(({ POST, use }) => [
  use(async (_event, next) => next(), { slot: "auth" }),

  POST<{
    json: {
      email: VRefine<string, { format: "email" }>;
      password: VRefine<string, { minLength: 1; maxLength: 200 }>;
      /** required once a second factor is enrolled; a missing one answers totp_required */
      totpCode?: VRefine<string, { maxLength: 20 }>;
    };
    response: [200, "json", { user: PublicUser }];
  }>(async (event) => {
    const { token, user } = await signIn(event.validated.json);
    writeSessionCookie(event, token);
    return { user: toPublicUser(user) };
  }),
]);
