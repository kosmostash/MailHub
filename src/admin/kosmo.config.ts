import {
  defineConfig,
  fetchGenerator,
  h3Generator,
  solidGenerator,
  typeboxGenerator,
} from "@kosmojs/dev";
import UnoCSS from "unocss/vite";

/**
 * The web application (spec §5): Solid pages at /admin,
 * session-authenticated API at /admin/api (default apiBase).
 * */
export default defineConfig({
  base: "/admin",
  generators: [
    solidGenerator({ tanstack: { query: true } }),
    h3Generator(),
    fetchGenerator(),
    typeboxGenerator(),
  ],
  plugins: [UnoCSS()],
});
