# MailHub

One self-hosted hub to store, review, and send the emails from all your projects.

Projects submit emails to MailHub (HTTP or SMTP) instead of sending them directly.
MailHub stores every submission, optionally holds it for review, sends it through a
configured provider, and tracks the delivery outcome, with operators doing the work and
admins overseeing it.

## Stack

- [KosmoJS](https://kosmojs.dev) (Hono backend, React frontend, TypeBox validation, typed fetch clients)
- Postgres via Knex
- UnoCSS with Tabler icons

## Layout

```
src/app/      web application: React pages at "/", session-authenticated API at "/hub"
src/api/      submission API for client projects at "/api" (emails, webhooks, health)
domain/       business logic shared by the web app and the workers
workers/      background sender and SMTP ingestion listener (separate processes)
db/           knex migration runner and migrations
test/         vitest suites against a real Postgres
```

## Development

Requirements: Node 22, pnpm, Postgres 16.

```sh
cp .env.example .env            # then set DATABASE_URL and MAILHUB_SECRET
pnpm install
pnpm migrate                    # apply migrations
pnpm dev                        # web app + both APIs on http://localhost:4556
pnpm sender                     # background sender, in another terminal
pnpm smtp                       # SMTP ingestion listener, in another terminal
```

Checks:

```sh
pnpm build
pnpm typecheck
pnpm test                       # needs TEST_DATABASE_URL (see .env.example)
```

## Production

`pnpm build` produces `dist/run.js` (web app and APIs on one port) and
`dist/workers/{sender,smtp}.js`. `docker-compose.yml` runs Postgres plus the three
processes. Expose only `/`, `/hub/*` and `/api/webhooks/*` publicly; keep `/api/emails*`
and the SMTP port on your LAN.
