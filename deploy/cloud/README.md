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

On first boot the backend container runs `prisma migrate deploy` automatically. Seed demo tenants once:

```bash
docker compose exec backend npm run prisma:seed
```

Visit `https://PUBLIC_HOST/` → login with `admin@example.com` / `admin123` using the `acme` tenant slug.

## Common operations

```bash
# Watch logs
docker compose logs -f backend

# Get a shell in the API container
docker compose exec backend sh

# Apply pending migrations manually
docker compose exec backend npx prisma migrate deploy

# Open Prisma Studio (bind to host port first: add "ports: - '5555:5555'" to backend temporarily)
docker compose exec backend npx prisma studio

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
