import { defineConfig } from "tsdown";

/** Bundles the worker processes for production: dist/workers/{sender,smtp}.js */
export default defineConfig({
  entry: ["workers/sender.ts", "workers/smtp.ts"],
  outDir: "dist/workers",
  format: "esm",
  platform: "node",
  target: "node22",
  alias: { "@": "." },
  clean: true,
  fixedExtension: false,
  sourcemap: true,
});
