/**
 * `pnpm build [folder]`: kosmo build (all folders, or the one named) followed by the
 * worker bundle. A wrapper because pnpm appends script arguments to the last command only.
 * */
import { spawnSync } from "node:child_process";

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run("kosmo", ["build", ...process.argv.slice(2)]);
run("tsdown", []);
