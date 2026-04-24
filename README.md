# HRMS

Multi-tenant Human Resource Management System. One codebase, two deployment targets:

- **Cloud** — public multi-tenant SaaS. Admin, Manager, and Employee roles per company.
- **Local** — single-tenant offline install at a company's site. Syncs with the cloud when online.

## Repo layout

```
.
├── src/                  Frontend (React + Vite + TailwindCSS + Radix UI)
├── deploy/
│   ├── cloud/            docker-compose + Caddy reverse proxy + TLS
│   ├── local/            docker-compose + nginx edge proxy
│   └── nginx/            Static asset nginx config (used by frontend container)
├── Dockerfile.frontend   Multi-stage build of the SPA into an nginx image
└── docs/ guidelines/     Product & design docs
```

The backend lives in a sibling folder: [`../HRM System API`](../HRM%20System%20API/) (Spring Boot 3.3 + Java 21 + PostgreSQL 16).

## Quickstart — Frontend only (legacy dev mode)

```bash
npm install
npm run dev        # Vite @ http://localhost:5173
```

No backend required — the UI runs against the mock data bundled under `src/app/data/`.

## Quickstart — Cloud deployment

```bash
cd deploy/cloud
cp .env.example .env          # set PUBLIC_HOST, passwords, JWT_SECRET
docker compose up -d --build
```

Flyway migrations run automatically on backend startup. Full guide: [`deploy/cloud/README.md`](deploy/cloud/README.md).

## Quickstart — Local deployment

```bash
cd deploy/local
cp .env.example .env          # set JWT_SECRET; tweak LOCAL_PORT if 8080 is busy
docker compose up -d --build
```

Full guide: [`deploy/local/README.md`](deploy/local/README.md).

## Backend — standalone dev

When you're working on API code outside Docker, run it from the sibling `HRM System API` folder:

```bash
cd "../HRM System API"

# Bring up just Postgres via compose
docker compose -f "../HRM System Frontend/deploy/local/docker-compose.yml" up -d db

export JWT_SECRET=dev-secret-change-me
./mvnw spring-boot:run         # API @ http://localhost:4000/api/v1
```

Then run the frontend as usual (`npm run dev` from repo root) — set `VITE_API_URL=http://localhost:4000/api/v1` in a local `.env` so the SPA talks to the live API instead of the bundled mocks.

## Architecture at a glance

```
 Super admin (platform console)
   └── Cloud HRMS (multi-tenant)
        ├── Company A tenant ──► Company A local install (via API key + sync worker)
        ├── Company B tenant ──► Company B local install
        └── Company C tenant ──► Company C local install
```

- Every backend record is scoped by `tenantId`.
- The **cloud** resolves the tenant from the signed JWT on every request.
- The **local install** has `DEPLOYMENT_MODE=local` and is pinned to exactly one tenant via `LOCAL_TENANT_SLUG` — users never pick a company at login.
- Local-to-cloud sync uses `X-API-Key` over HTTPS (see `SyncController` in `HRM System API`). The worker itself is implemented on the Spring Boot side.

## Demo credentials (seeded)

| Role      | Email                  | Password     |
|-----------|------------------------|--------------|
| Admin     | admin@example.com      | admin123     |
| Employee  | jane@example.com       | password123  |

Cloud seed creates two tenants (`acme`, `contoso`); local seed creates one (`local-site` by default).

## Upgrading

```bash
git pull
# then in whichever deploy you use:
docker compose up -d --build
```

Schema changes are applied by the backend container via Flyway on startup.
