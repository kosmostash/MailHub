# MailHub

One self-hosted hub to store, review, and send the emails from all your projects.

Projects submit emails to MailHub (HTTP or SMTP) instead of sending them directly.
MailHub stores every submission, optionally holds it for review, sends it through a
configured provider, and tracks the delivery outcome, with operators doing the work and
admins overseeing it.

## Stack

- [KosmoJS](https://kosmojs.dev) (Hono and H3 backends, Solid frontend, MDX docs, TypeBox validation, typed fetch clients)
- Postgres via Knex
- UnoCSS with Tabler icons

## Layout

```
src/api/       submission API for client projects at "/api" (emails, health) - Hono, private
src/webhooks/  delivery-event webhooks at "/webhooks/<provider>" - Hono, public
src/admin/     web application: Solid pages at "/admin", session API at "/admin/api" - H3
src/docs/      documentation site at "/" - MDX
domain/        business logic shared by the web app, the APIs and the workers
workers/       background sender and SMTP ingestion listener (separate processes)
db/            knex migration runner and migrations
test/          vitest suites against a real Postgres
```

## Development

Requirements: Node 22, pnpm, Postgres 16.

```sh
cp .env.example .env            # then set DATABASE_URL and MAILHUB_SECRET
pnpm install
pnpm migrate                    # apply migrations
pnpm dev                        # all folders on http://localhost:4556 (admin app at /admin)
pnpm sender                     # background sender, in another terminal
pnpm smtp                       # SMTP ingestion listener, in another terminal
```

Checks:

```sh
pnpm build
pnpm typecheck
pnpm test                       # Vitest against TEST_DATABASE_URL, incl. the spec §8 conformance run
pnpm e2e                        # Chromium walkthrough of the admin app (pnpm exec playwright install chromium)
```

`test/conformance.test.ts` runs the specification's conformance walk-through end to end
against the built dispatcher, the real sender process and the SMTP listener.

## Production

`pnpm build` produces `dist/run.js` (every folder on one port) and
`dist/workers/{sender,smtp}.js`. `docker-compose.yml` runs Postgres plus the three
processes. Expose `/` (docs), `/admin` and `/webhooks` publicly; keep `/api` and the SMTP
port on your LAN. `deploy/Caddyfile` shows that split for Caddy, and the docs site at `/`
carries the API, SMTP, provider, role and deployment reference.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `MAILHUB_SECRET` | 32+ random bytes; encrypts provider credentials |
| `MAILHUB_PUBLIC_URL` | where users reach the admin app |
| `MAILHUB_SYSTEM_SMTP_URL`, `MAILHUB_SYSTEM_FROM` | transport for confirmation codes; required in production, logged in development when unset |
| `MAILHUB_SMTP_HOST`, `MAILHUB_SMTP_PORT`, `MAILHUB_SMTP_MAX_MESSAGE_BYTES` | SMTP ingestion listener |
| `MAILHUB_SENDER_INTERVAL_MS`, `MAILHUB_SENDER_BATCH_SIZE` | background sender |
| `PORT` | web process |
