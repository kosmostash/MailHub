import { defineConfig, fetchGenerator, honoGenerator, typeboxGenerator } from "@kosmojs/dev";

/**
 * The submission API (spec §3): backend only, no pages. Private: LAN/DMZ only.
 * base "/api" + apiBase "/" puts routes directly under /api (e.g. /api/emails, /api/health).
 * */
export default defineConfig({
  base: "/api",
  apiBase: "/",
  generators: [honoGenerator(), fetchGenerator(), typeboxGenerator()],
});
