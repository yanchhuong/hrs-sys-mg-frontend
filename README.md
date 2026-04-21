# HRMS

Multi-tenant Human Resource Management System. One codebase, two deployment targets:

- **Cloud** — public multi-tenant SaaS. Admin, Manager, and Employee roles per company.
- **Local** — single-tenant offline install at a company's site. Syncs with the cloud when online.

## Repo layout

```
.
├── src/                  Frontend (React + Vite + TailwindCSS + Radix UI)
├── backend/              Node 20 + Express + Prisma 5 (shared by cloud and local)
│   ├── src/              Routes, middleware, server entry
│   └── prisma/           Schema + seed script
├── deploy/
│   ├── cloud/            docker-compose + Caddy reverse proxy + TLS
│   ├── local/            docker-compose + optional sync worker
│   └── nginx/            Static asset nginx config (used by frontend container)
├── Dockerfile.frontend   Multi-stage build of the SPA into an nginx image
└── docs/ guidelines/     Product & design docs
```

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
docker compose exec backend npm run prisma:seed
```

Full guide: [`deploy/cloud/README.md`](deploy/cloud/README.md).

## Quickstart — Local deployment

```bash
cd deploy/local
cp .env.example .env          # set JWT_SECRET; tweak LOCAL_PORT if 8080 is busy
docker compose up -d --build
docker compose exec backend npm run prisma:seed
```

Full guide: [`deploy/local/README.md`](deploy/local/README.md).

## Backend — standalone dev

When you're working on API code outside Docker:

```bash
cd backend
cp .env.example .env          # set DATABASE_URL + JWT_SECRET

# Bring up just Postgres via compose
docker compose -f ../deploy/local/docker-compose.yml up -d db

npm install
npx prisma migrate dev
npm run prisma:seed
npm run dev                   # API @ http://localhost:4000
```

Then run the frontend as usual (`npm run dev` from repo root) — set `VITE_API_URL=http://localhost:4000/api` in a local `.env` so the SPA talks to the live API instead of the bundled mocks.

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
- Local-to-cloud sync uses `X-API-Key` over HTTPS (see `backend/src/routes/sync.ts`). The worker itself is a stub you can implement once your data-model is finalised.

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

Schema changes are applied by the backend container via `prisma migrate deploy` on startup.
