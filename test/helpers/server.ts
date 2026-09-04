import { spawn, type ChildProcess } from "node:child_process";

/**
 * Black-box harness: starts the built dispatcher (dist/run.js) on a free port with the
 * test database, and offers a cookie-aware HTTP client. Run `pnpm build` first.
 * */
export type Response = { status: number; body: any; headers: Headers };

export class Client {
  private cookies = new Map<string, string>();

  constructor(readonly baseUrl: string) {}

  async call(
    method: string,
    path: string,
    options: { json?: unknown; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { accept: "application/json", ...options.headers };
    if (this.cookies.size) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    let body: string | undefined;
    if (options.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.json);
    }
    const res = await fetch(this.baseUrl + path, { method, headers, body, redirect: "manual" });
    for (const setCookie of res.headers.getSetCookie()) {
      const [pair, ...attrs] = setCookie.split(";");
      const [name, value] = pair!.split("=");
      const expired = attrs.some((a) => /max-age=0|expires=/i.test(a.trim()) && /max-age=0|1970/i.test(a));
      if (expired || !value) {
        this.cookies.delete(name!.trim());
      } else {
        this.cookies.set(name!.trim(), value.trim());
      }
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      // not JSON
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  get = (path: string, headers?: Record<string, string>) => this.call("GET", path, { headers });
  post = (path: string, json?: unknown, headers?: Record<string, string>) =>
    this.call("POST", path, { json, headers });
  patch = (path: string, json?: unknown) => this.call("PATCH", path, { json });
  delete = (path: string, json?: unknown) => this.call("DELETE", path, { json });

  hasCookie = (name: string) => this.cookies.has(name);
  clearCookies = () => this.cookies.clear();
}

export type TestServer = { baseUrl: string; client: () => Client; stop: () => Promise<void> };

export const startServer = async (): Promise<TestServer> => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child: ChildProcess = spawn(process.execPath, ["dist/run.js", "-p", String(port)], {
    env: { ...process.env, NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`dist/run.js exited with ${child.exitCode}:\n${output}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        break;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (Date.now() >= deadline) {
    child.kill("SIGKILL");
    throw new Error(`dist/run.js did not become healthy:\n${output}`);
  }

  return {
    baseUrl,
    client: () => new Client(baseUrl),
    stop: () =>
      new Promise((resolve) => {
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 3000).unref();
      }),
  };
};
