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
# …edit .env: set JWT_SECRET, set HRMS_BOOTSTRAP_SUPER_ADMIN_PASSWORD,
#   tweak LOCAL_PORT if 8080 is busy…

docker compose up -d --build
```

Flyway migrations (in `HRM System API/src/main/resources/db/migration/`) run automatically on backend startup. On first boot, the `SuperAdminBootstrapper` runs once after migrations:

1. **Wipes the V2 demo tenants** (`acme` and `local-site`) so the database starts genuinely empty — no `admin@example.com`, no demo employees.
2. **Creates a dedicated `platform` tenant** plus a `super_admin` user in it, using `HRMS_BOOTSTRAP_SUPER_ADMIN_EMAIL` / `_PASSWORD` from `.env`.

Open `http://localhost:8080/` → sign in with the super-admin email + password you set in `.env`. From the Super Admin app you can create the actual operating tenants, then sync data in from your local-machine dev install (see below).

> The bootstrap is idempotent: subsequent restarts do nothing if the demo tenants are already gone and a super_admin already exists. Set `HRMS_BOOTSTRAP_WIPE_DEMO_DATA=false` after the first successful boot if you'd rather not have it run every time.

## Running Docker side-by-side with native local dev

The Docker stack is fully isolated from the Windows-native `mvn spring-boot:run` + `vite` flow. They use **different ports and different databases** so both can run at the same time:

| Layer    | Native local (Windows)                         | Docker (this stack)                       |
|----------|------------------------------------------------|-------------------------------------------|
| Postgres | `localhost:5432`, db `hrs-system-mg-db`        | container, network-internal only         |
| Backend  | `localhost:4000` (`mvn spring-boot:run`)       | container, fronted by nginx              |
| Frontend | `localhost:5173` (`vite` dev)                  | container, served by nginx               |
| Public URL | `http://localhost:5173`                      | `http://localhost:8080`                  |
| Demo data | V2 demo seed (`acme` + `local-site` tenants) | wiped — only `platform` + super_admin    |
| Login    | `admin@example.com` / `admin123`               | the email / password from your `.env`    |

The Docker DB volume (`hrms-local_db-data`) is separate from the Windows Postgres data directory — wiping one does not affect the other.

**To bring up Docker without disturbing the running native stack:**

```bash
cd deploy/local
cp .env.example .env       # edit JWT_SECRET + HRMS_BOOTSTRAP_SUPER_ADMIN_PASSWORD
docker compose up -d --build
```

The Windows `mvn spring-boot:run` keeps running on port 4000; the Docker proxy comes up on port 8080. Browse to either URL to use that stack independently.

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
- **Login says "Invalid credentials"** → confirm the `SuperAdminBootstrapper` ran (`docker compose logs backend | grep "Bootstrap:"` should show one or two lines about wiping demo tenants and creating a super_admin). If the bootstrapper logged nothing, double-check `HRMS_BOOTSTRAP_SUPER_ADMIN_EMAIL` / `_PASSWORD` are both non-blank in your `.env`. The login screen expects the **super_admin email**, not `admin@example.com`.
- **Sync is idle** → make sure `CLOUD_API_URL` and `LOCAL_API_KEY` are set in `.env`, then restart the backend container.
