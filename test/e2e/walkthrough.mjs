/**
 * Browser walkthrough of the admin app (spec §8 through the UI): bootstrap, accounts,
 * impersonation, providers, collections, submission, review, sending, governance, and a
 * credential change. Self-contained: starts a fake SMTP server (provider and system
 * mail), resets the database, spawns the built dispatcher, drives Chromium.
 *
 *   pnpm build && pnpm e2e      # needs DATABASE_URL (a disposable database) and MAILHUB_SECRET
 *
 * Chromium: `pnpm exec playwright install chromium`, or set PLAYWRIGHT_CHROMIUM to a binary.
 * */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

import knex from "knex";
import { simpleParser } from "mailparser";
import { chromium } from "playwright";
import { SMTPServer } from "smtp-server";

const shots = process.env.SHOTS ?? "test/e2e/screenshots";
mkdirSync(shots, { recursive: true });

// fake provider + system-mail target
const received = [];
const fakeSmtp = new SMTPServer({
  authOptional: true, disabledCommands: ["AUTH", "STARTTLS"], disableReverseLookup: true, logger: false,
  async onData(stream, session, cb) { received.push(await simpleParser(stream)); cb(null, "queued"); },
});
const smtpPort = await new Promise((resolve) => fakeSmtp.listen(0, "127.0.0.1", () => resolve(fakeSmtp.server.address().port)));

// clean database
const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
await database.migrate.latest({ directory: "./db/migrations", extension: "ts", loadExtensions: [".ts"] }).catch(() => undefined);
await database.raw("truncate table activity, system_emails, confirmation_codes, test_addresses, emails, collections, providers, sessions, users restart identity cascade");
await database.destroy();

// the built dispatcher
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["dist/run.js", "-p", String(port)], {
  env: { ...process.env, MAILHUB_SYSTEM_SMTP_URL: `smtp://127.0.0.1:${smtpPort}` },
  stdio: ["ignore", "ignore", "inherit"],
});
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 150));
}

const errors = [];
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("response", (r) => { if (r.status() >= 500) errors.push(`http ${r.status()} ${r.url()}`); });

let failed = false;
const step = async (name, fn) => {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failed = true; console.log("FAIL", name, "-", e.message.split("\n")[0]); await page.screenshot({ path: `${shots}/fail-${name.replace(/\W+/g, "_")}.png` }); throw e; }
};

await step("redirects to sign-in with the bootstrap proposal", async () => {
  await page.goto(base + "/admin");
  await page.waitForURL(/\/admin\/sign-in$/);
  await page.getByText("Create the superadmin").waitFor();
  await page.screenshot({ path: `${shots}/01-bootstrap.png` });
});
await step("creates the superadmin and lands on Admins", async () => {
  await page.getByLabel("Email", { exact: true }).fill("root@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Create and sign in" }).click();
  await page.waitForURL(/\/admin\/admins$/);
  await page.getByText("No admins yet.").waitFor();
  await page.screenshot({ path: `${shots}/02-admins-empty.png` });
});
await step("creates an admin", async () => {
  await page.getByRole("button", { name: "New admin" }).click();
  await page.getByLabel("Email", { exact: true }).fill("one@example.test");
  await page.getByLabel("Initial password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("cell", { name: "one@example.test" }).waitFor();
  await page.screenshot({ path: `${shots}/03-admins-one.png` });
});
await step("impersonates the admin and shows the banner", async () => {
  await page.getByRole("button", { name: "Impersonate" }).click();
  await page.waitForURL(/\/admin\/?$/);
  await page.getByRole("status").getByText("Acting as").waitFor();
  await page.getByRole("navigation").getByRole("link", { name: "Operators" }).waitFor();
  await page.screenshot({ path: `${shots}/04-impersonating.png` });
});
await step("creates an operator as the impersonated admin", async () => {
  await page.getByRole("navigation").getByRole("link", { name: "Operators" }).click();
  await page.waitForURL(/\/admin\/operators$/);
  await page.getByRole("button", { name: "New operator" }).click();
  await page.getByLabel("Email", { exact: true }).fill("o1@example.test");
  await page.getByLabel("Initial password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("cell", { name: "o1@example.test" }).waitFor();
  await page.screenshot({ path: `${shots}/05-operators.png` });
});
await step("creates an SMTP provider as the impersonated admin", async () => {
  await page.getByRole("navigation").getByRole("link", { name: "Providers" }).click();
  await page.waitForURL(/\/admin\/providers$/);
  await page.getByRole("button", { name: "New provider" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Main SMTP");
  await page.getByLabel("Host", { exact: true }).fill("127.0.0.1");
  await page.getByLabel("Port", { exact: true }).fill(String(smtpPort));
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("cell", { name: "Main SMTP" }).waitFor();
  await page.screenshot({ path: `${shots}/05b-providers.png` });
});
await step("edits the provider", async () => {
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Username", { exact: true }).fill("mailer");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("cell", { name: /127.0.0.1:\d+ as mailer/ }).waitFor();
});
await step("as admin, the dashboard is read-only and empty so far", async () => {
  await page.getByRole("navigation").getByRole("link", { name: "Dashboard" }).click();
  await page.getByText("No collections yet.").waitFor();
});
await step("refuses nested impersonation with a visible error", async () => {
  await page.getByRole("navigation").getByRole("link", { name: "Operators" }).click();
  await page.waitForURL(/\/admin\/operators$/);
  await page.getByRole("button", { name: "Impersonate" }).click();
  await page.getByRole("alert").getByText(/does not nest/).waitFor();
});
await step("ends impersonation", async () => {
  await page.getByRole("button", { name: "End impersonation" }).click();
  await page.waitForURL(/\/admin\/admins$/);
  await page.getByRole("navigation").getByRole("link", { name: "Admins" }).waitFor();
});
await step("signs out to the regular sign-in form", async () => {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/admin\/sign-in$/);
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
  await page.screenshot({ path: `${shots}/06-sign-in.png` });
});
await step("signs in as the operator and sees the dashboard", async () => {
  await page.getByLabel("Email", { exact: true }).fill("o1@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin\/?$/);
  await page.getByText("No collections yet").waitFor();
  await page.screenshot({ path: `${shots}/07-operator-dashboard.png` });
});
await step("creates a collection with the admin's provider", async () => {
  await page.getByRole("button", { name: "New collection" }).click();
  await page.getByLabel("Name", { exact: true }).fill("project-a");
  await page.getByRole("option", { name: "Main SMTP (smtp)" }).waitFor({ state: "attached" }).catch(async () => { console.log("options now:", await page.locator("select option").allTextContents()); });
  await page.getByLabel("Provider", { exact: true }).selectOption({ label: "Main SMTP (smtp)" });
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("link", { name: /project-a/ }).waitFor();
  await page.screenshot({ path: `${shots}/08-operator-collections.png` });
});
await step("opens the collection, sees the API key and edits the schedule", async () => {
  await page.getByRole("link", { name: /project-a/ }).click();
  await page.waitForURL(/\/admin\/collections\/[A-Za-z0-9_-]{32}$/);
  await page.getByText("API key").waitFor();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel(/Immediate/).check();
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText(/· immediate ·/).waitFor();
  await page.screenshot({ path: `${shots}/09-collection.png` });
});
await step("receives a submitted email and lists it as ready (immediate mode)", async () => {
  const key = page.url().split("/").pop();
  const res = await fetch(base + "/api/emails", {
    method: "POST",
    headers: { "content-type": "application/json", "x-collection-id": key },
    body: JSON.stringify({ from: { address: "app@example.test", name: "App" }, to: ["user@example.test"], subject: "Welcome aboard", html: "<h1 style='color:rebeccapurple'>Hello</h1><script>document.title='pwned'</script>", text: "Hello" }),
  });
  if (res.status !== 201) throw new Error("submit failed: " + res.status + " " + await res.text());
  await page.reload();
  await page.getByRole("cell", { name: /ready/ }).waitFor();
  await page.getByRole("link", { name: "Welcome aboard" }).waitFor();
  await page.screenshot({ path: `${shots}/10-email-list.png` });
});
await step("opens the email with a sandboxed preview", async () => {
  await page.getByRole("link", { name: "Welcome aboard" }).click();
  await page.waitForURL(/\/admin\/emails\/[0-9a-f-]{36}$/);
  const frame = page.frameLocator('iframe[title="Email preview"]');
  await frame.getByRole("heading", { name: "Hello" }).waitFor();
  if (await page.title() === "pwned") throw new Error("script ran inside the preview frame");
  await page.getByText("App <app@example.test>").waitFor();
  await page.screenshot({ path: `${shots}/11-email.png` });
});
await step("sends the email explicitly from the email page", async () => {
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("status").getByText(/Sent: the provider accepted/).waitFor();
  await page.getByText("sent", { exact: true }).first().waitFor();
  if (!received.some((m) => m.subject === "Welcome aboard")) throw new Error("fake SMTP did not receive the email");
  await page.screenshot({ path: `${shots}/12-email-sent.png` });
});
await step("adds a test address and sends a [test] copy", async () => {
  await page.getByRole("navigation").getByRole("link", { name: "Account" }).click();
  await page.waitForURL(/\/admin\/account$/);
  await page.getByLabel("Address", { exact: true }).fill("me@example.test");
  await page.getByLabel("Label (optional)", { exact: true }).fill("Me");
  await page.getByRole("button", { name: "Add test address" }).click();
  await page.getByText("me@example.test").waitFor();
  await page.goBack();
  await page.waitForURL(/\/admin\/emails\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Send to me" }).click();
  await page.getByRole("status").getByText(/A \[test\] copy went to me@example.test/).waitFor();
  if (!received.some((m) => m.subject === "[test] Welcome aboard")) throw new Error("fake SMTP did not receive the test copy");
  await page.getByRole("link", { name: "Back to collection" }).click();
  await page.waitForURL(/\/admin\/collections\/[A-Za-z0-9_-]{32}$/);
});
await step("bulk-sends two ready emails with a per-email report", async () => {
  const key = page.url().split("/").pop();
  for (const subject of ["Bulk one", "Bulk two"]) {
    const res = await fetch(base + "/api/emails", {
      method: "POST",
      headers: { "content-type": "application/json", "x-collection-id": key },
      body: JSON.stringify({ from: "app@example.test", to: ["user@example.test"], subject, text: subject }),
    });
    if (res.status !== 201) throw new Error("submit failed: " + res.status);
  }
  await page.reload();
  await page.getByRole("link", { name: "Bulk two" }).waitFor();
  await page.getByLabel("Select all ready emails on this page").check();
  await page.getByRole("button", { name: /Send selected \(2\)/ }).click();
  await page.getByRole("status").getByText("Bulk one: sent").waitFor();
  await page.getByRole("status").getByText("Bulk two: sent").waitFor();
  await page.screenshot({ path: `${shots}/13-bulk-sent.png` });
});
await step("as admin, the activity trail shows the operator's actions with the impersonation marker", async () => {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/admin\/sign-in$/);
  await page.getByLabel("Email", { exact: true }).fill("one@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin\/?$/);
  await page.getByRole("navigation").getByRole("link", { name: "Activity" }).click();
  await page.waitForURL(/\/admin\/activity$/);
  await page.getByRole("cell", { name: "email.sent" }).first().waitFor();
  await page.getByText("via impersonation by root@example.test").first().waitFor();
  await page.screenshot({ path: `${shots}/14-activity.png` });
});
await step("disables the operator, reassigns and deletes it", async () => {
  await page.getByRole("navigation").getByRole("link", { name: "Operators" }).click();
  await page.getByRole("button", { name: "New operator" }).click();
  await page.getByLabel("Email", { exact: true }).fill("o2@example.test");
  await page.getByLabel("Initial password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("cell", { name: "o2@example.test" }).waitFor();
  const rowO1 = page.getByRole("row", { name: /o1@example.test/ });
  page.once("dialog", (d) => d.accept());
  await rowO1.getByRole("button", { name: "Disable" }).click();
  await page.getByRole("status").getByText("o1@example.test is disabled.").waitFor();
  await rowO1.getByRole("button", { name: "Reassign" }).click();
  await page.locator("form").getByRole("button", { name: "Reassign" }).click();
  await page.getByRole("status").getByText(/Moved 1 collection\(s\) from o1@example.test to o2@example.test/).waitFor();
  page.once("dialog", (d) => d.accept());
  await rowO1.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("status").getByText("o1@example.test is deleted.").waitFor();
  await page.screenshot({ path: `${shots}/15-operators-after.png` });
});
await step("changes the admin's password only after entering the emailed code", async () => {
  await page.getByRole("navigation").getByRole("link", { name: "Account" }).click();
  await page.waitForURL(/\/admin\/account$/);
  await page.getByLabel("New password", { exact: true }).fill("a much better password");
  await page.locator("form", { has: page.getByLabel("New password", { exact: true }) }).getByRole("button", { name: "Send confirmation code" }).click();
  await page.getByRole("status").getByText(/A code was sent to one@example.test/).waitFor();
  const msg = received.find((m) => m.subject === "Confirm your MailHub password change");
  if (!msg) throw new Error("no confirmation code email arrived at the system SMTP");
  const code = msg.text.match(/code is (\d{6})/)[1];
  await page.getByLabel("Confirmation code", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("alert").getByText(/not valid/).waitFor();
  await page.getByLabel("Confirmation code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("status").getByText("Your password is changed.").waitFor();
  await page.screenshot({ path: `${shots}/16-account.png` });
});
await step("deletes the collection after confirming, as the new owner", async () => {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/admin\/sign-in$/);
  await page.getByLabel("Email", { exact: true }).fill("o2@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin\/?$/);
  await page.getByRole("link", { name: /project-a/ }).click();
  await page.waitForURL(/\/admin\/collections\/[A-Za-z0-9_-]{32}$/);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/admin\/?$/);
  await page.getByText("No collections yet").waitFor();
});

await browser.close();
server.kill("SIGTERM");
await new Promise((r) => fakeSmtp.close(r));
if (errors.length) { console.log("browser errors:\n" + errors.join("\n")); process.exit(1); }
if (failed) process.exit(1);
console.log("walkthrough passed");
