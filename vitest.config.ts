import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    // the same "@/" alias kosmo declares in tsconfig: project root
    alias: [{ find: /^@\//, replacement: root }],
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
    // tests share one database; run files one at a time
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
