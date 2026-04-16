# Postiz self-hosted

Headless social scheduler. Used by `kamiyo-marketing-agent` to queue and publish posts.

Upstream: https://github.com/gitroomhq/postiz-app (AGPL-3.0).

## Quick start

```bash
cd infra/postiz
cp .env.example .env
# edit .env: set POSTIZ_JWT_SECRET and POSTIZ_DB_PASSWORD
docker compose up -d
```

Postiz UI at `http://localhost:5000`. First login creates the admin account, then flip `POSTIZ_DISABLE_REGISTRATION=true` and recreate the container.

## Stack

- `postiz` — Next.js app + API on port 5000
- `postgres` — Postgres 16, persistent volume
- `redis` — Redis 7 for BullMQ queues

Data persists in docker volumes `postiz-config`, `postiz-uploads`, `postiz-postgres`, `postiz-redis`.

## Operations

```bash
docker compose logs -f postiz    # tail app logs
docker compose pull && docker compose up -d   # upgrade image
docker compose down              # stop (volumes preserved)
docker compose down -v           # nuke everything
```

## Agent integration

`kamiyo-marketing-agent` talks to Postiz via its REST API (`${POSTIZ_BACKEND_URL}`) using an API key issued in Settings → API. The agent schedules posts on accounts already connected through the Postiz UI.
