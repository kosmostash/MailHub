import {
  defineConfig,
  fetchGenerator,
  honoGenerator,
  reactGenerator,
  typeboxGenerator,
} from "@kosmojs/dev";
import UnoCSS from "unocss/vite";

/**
 * The web application: React pages at "/", session-authenticated hub API at "/hub".
 * The client-facing submission API lives in its own folder (src/api) at "/api".
 * */
export default defineConfig({
  base: "/",
  apiBase: "/hub",
  generators: [
    reactGenerator({ tanstack: { query: true } }),
    honoGenerator(),
    fetchGenerator(),
    typeboxGenerator(),
  ],
  plugins: [UnoCSS()],
});
