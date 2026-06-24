# HRMS — Cloud Deployment

Multi-tenant production stack. One command brings up Postgres, the API, the SPA, and a Caddy reverse proxy with auto HTTPS.

## Prerequisites

- A server with **Docker ≥ 24** and **Docker Compose v2** (`docker compose` subcommand).
- A DNS `A` record pointing `PUBLIC_HOST` (e.g. `hrms.example.com`) at this server.
- Ports **80** and **443** open on the firewall — Let's Encrypt needs them.

## Quickstart

```bash
# from repo root
cd deploy/cloud
cp .env.example .env
# …edit .env: set PUBLIC_HOST, POSTGRES_PASSWORD, JWT_SECRET, ACME_EMAIL…

docker compose up -d --build
```

On first boot the backend container applies Flyway migrations (`HRM System API/src/main/resources/db/migration/`) automatically and seeds the built-in roles, default tenants, and admin user.

Visit `https://PUBLIC_HOST/` → login with `admin@example.com` / `admin123` using the `acme` tenant slug.

## Telegram AI-Agent (optional but needed for notifications)

The Telegram bot side (Invoice push, Announcement fan-out, payment
receipts) is a **separate docker-compose project** at
`AI-Agent/docker-compose.yml`. Bring it up on the **same droplet**
before the backend so `host.docker.internal:5174` resolves:

```bash
# 1) Agent first
cd /path/to/AI-Agent
cp .env.example .env
#   …edit .env: set DATABASE_URL (the SAME Postgres the backend uses,
#   via a Managed Postgres URL or `host.docker.internal:5432` if both
#   stacks share the host), API_BASE_URL (your backend's public URL
#   for the agent's outbound calls), and TELEGRAM_AGENT_SECRET (must
#   match the same var in the backend .env)…
docker compose up -d --build
docker compose logs -f ai-agent     # confirm "listening on :5174"

# 2) Backend
cd /path/to/HRM\ System\ Frontend/deploy/cloud
# Make sure TELEGRAM_AGENT_BASE_URL + TELEGRAM_AGENT_SECRET in .env
# are set (see .env.example).
docker compose up -d --build
```

If Telegram delivery returns **"Telegram delivery is not configured
on this server"** or **"ConnectException: Connection refused"** in
the Announcement detail dialog, check in this order:

1. `docker ps` shows `hrms-ai-agent` running.
2. From inside the backend container:
   `docker compose exec backend wget -qO- http://host.docker.internal:5174/health`
   should return JSON. If it hangs / refuses, the agent isn't
   reachable.
3. `TELEGRAM_AGENT_SECRET` is identical in `deploy/cloud/.env` and
   `AI-Agent/.env`.
4. The tenant has at least one HR Telegram bot registered AND
   enabled in Super Admin → Telegram Bots (the agent logs every
   polling worker on startup; if the tenant's bot isn't in the list,
   register it then `docker compose restart ai-agent`).

After fixing env vars, `docker compose restart backend` picks them up.

## Common operations

```bash
# Watch logs
docker compose logs -f backend

# Get a shell in the API container
docker compose exec backend sh

# Flyway migrations apply on startup — to re-run manually, restart the backend
docker compose restart backend

# Back up the database
docker compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backups/$(date +%Y%m%d).sql

# Update + redeploy
git pull
docker compose up -d --build
```

## Operations notes

- **Secrets** live only in `.env` on the server; never check them in.
- **TLS** is handled by Caddy against Let's Encrypt. Certs survive restarts via the `caddy-data` volume.
- **Database backups**: schedule `pg_dump` to S3 or equivalent. The included `db-data` volume is not itself a backup.
- **Scaling**: `backend` is stateless — scale with `docker compose up -d --scale backend=3` and put a load balancer in front (or use Caddy's `lb_policy`).
- **Tenant onboarding**: create new tenants by seeding or via an admin-only endpoint (to be added). Each tenant's `apiKey` is what local-install sites use to auth with the cloud.

## Ports

| Service   | Exposed to host | Internal |
|-----------|-----------------|----------|
| caddy     | 80, 443         | —        |
| frontend  | —               | 80       |
| backend   | —               | 4000     |
| db        | —               | 5432     |

Only Caddy is reachable from the internet; everything else lives on the private docker network.
