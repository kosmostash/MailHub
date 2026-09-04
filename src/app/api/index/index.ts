import { defineRoute } from "_/api";

export default defineRoute<"index">(({ GET }) => [
  GET(async (ctx) => {
    // Always `return` the response!
    // ❗ Never call `ctx.json()` / `ctx.text()` / `ctx.body()` without returning!
    return ctx.text("Automatically generated route");
  }),
]);
