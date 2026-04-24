# HRMS — Local (Offline) Installation

Single-tenant on-premises install. Runs on a laptop / mini-PC / on-site server. Works without internet; syncs with the cloud when reachable.

## Prerequisites

- **Docker ≥ 24** and **Docker Compose v2**. Windows / macOS users install Docker Desktop; Linux users install the `docker` and `docker compose` packages.
- 2 GB free disk for the database volume.
- No public DNS or certificates needed — the UI is served at `http://localhost:<LOCAL_PORT>`.

## Quickstart

```bash
cd deploy/local
cp .env.example .env
# …edit .env: set JWT_SECRET (required), tweak LOCAL_PORT if 8080 is busy…

docker compose up -d --build
```

Flyway migrations (in `HRM System API/src/main/resources/db/migration/`) run automatically on backend startup and seed the default tenant, admin user, and built-in roles.

Open `http://localhost:8080/` → sign in with `admin@example.com` / `admin123`.

> Because the local deployment is pinned to one tenant (`LOCAL_TENANT_SLUG`), users do not need to pick a company at the login screen.

## Connecting to the cloud (optional sync)

If this site should sync with the cloud HRMS:

1. Your cloud admin gives you a tenant **API key** for this site.
2. Put it in `.env`:
   ```
   CLOUD_API_URL=https://hrms.example.com
   CLOUD_API_KEY=the-long-random-key-from-your-admin
   LOCAL_API_KEY=${CLOUD_API_KEY}
   ```
3. Restart the backend: `docker compose up -d backend`.

Sync is implemented inside the Spring Boot service (`SyncController` / scheduled task) and activates when `CLOUD_API_URL` + `LOCAL_API_KEY` are present — no separate worker container is needed.

## Common operations

```bash
# Watch logs
docker compose logs -f

# Update code and redeploy
git pull
docker compose up -d --build

# Back up your local DB to a timestamped file
mkdir -p backups
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backups/$(date +%Y%m%d_%H%M).sql

# Restore a backup
cat backups/20260421_0900.sql | docker compose exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"

# Fresh start (WIPES all local data)
docker compose down -v
```

## What differs from the cloud deploy

| Aspect          | Cloud                                   | Local                                     |
|-----------------|-----------------------------------------|-------------------------------------------|
| TLS             | Caddy + Let's Encrypt                   | HTTP only on `localhost`                  |
| Tenants         | Many; selected at login                 | One; pinned via `LOCAL_TENANT_SLUG`        |
| Public port     | 80 / 443                                | `LOCAL_PORT` (default 8080) on loopback    |
| Sync            | Not applicable                           | Optional; runs inside the Spring Boot container |
| Database        | Hardened password, offsite backups      | Default creds OK (DB not publicly reachable) |

## Troubleshooting

- **`docker compose` isn't a recognised command** → upgrade to Docker Compose v2 or use `docker-compose` (v1) with adjusted syntax.
- **Port 8080 already in use** → set `LOCAL_PORT=9000` in `.env` and restart.
- **Login says "Invalid credentials"** → the Flyway seed hasn't run yet (check `docker compose logs backend`), or you changed `LOCAL_TENANT_SLUG` after the first startup.
- **Sync is idle** → make sure `CLOUD_API_URL` and `LOCAL_API_KEY` are set in `.env`, then restart the backend container.
