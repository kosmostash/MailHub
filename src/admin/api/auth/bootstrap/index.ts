import { defineRoute } from "_/api";

import { createSuperadmin, superadminExists } from "@/domain/accounts/bootstrap";
import { type PublicUser, toPublicUser } from "@/domain/accounts/types";
import { conflict } from "@/domain/errors";
import { createSession } from "@/domain/sessions";
import { writeSessionCookie } from "~/lib/session-cookie";

/**
 * First-run bootstrap (spec §2.1.4, §5.1). Public: there is nobody to sign in yet.
 * GET says whether the superadmin still needs creating; POST creates it and signs in.
 * */
export default defineRoute<"auth/bootstrap">(({ GET, POST, use }) => [
  use(async (_event, next) => next(), { slot: "auth" }),

  GET<{
    response: [200, "json", { needed: boolean }];
  }>(async () => {
    return { needed: !(await superadminExists()) };
  }),

  POST<{
    json: {
      email: VRefine<string, { format: "email" }>;
      password: VRefine<string, { minLength: 8; maxLength: 200 }>;
    };
    response: [201, "json", { user: PublicUser }];
  }>(async (event) => {
    if (await superadminExists()) {
      throw conflict("superadmin_exists", "A superadmin already exists");
    }
    const user = await createSuperadmin(event.validated.json);
    const { token } = await createSession(user.id);
    writeSessionCookie(event, token);
    event.res.status = 201;
    return { user: toPublicUser(user) };
  }),
]);
