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
src/docs/      documentation site at "/docs" - MDX
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
pnpm test                       # needs TEST_DATABASE_URL (see .env.example)
```

## Production

`pnpm build` produces `dist/run.js` (every folder on one port) and
`dist/workers/{sender,smtp}.js`. `docker-compose.yml` runs Postgres plus the three
processes. Expose `/admin`, `/docs` and `/webhooks` publicly; keep `/api` and the SMTP
port on your LAN.
