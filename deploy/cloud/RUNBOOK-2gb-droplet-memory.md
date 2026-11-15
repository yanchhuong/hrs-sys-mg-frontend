# Runbook: fit the API on the 2 GB droplet (backend-02)

**Purpose:** stop the API from running out of memory ("Ran out of memory
retrieving query results" / `OutOfMemoryError: Java heap space`) on the 2 GB
droplet, and keep the whole `backend-02` stack inside 2 GB.

**Status:** to do. Code fix is pushed (API commit `9020cf9`); the droplet
changes below are not applied yet.

---

## Why

1. **Code (fixed in `9020cf9`).** Item photos are stored inline as base64
   (up to 5 per item, several MB a row). The item image URL, Stock
   Movements, Stock Adjustments and Stock Count loaded the whole row,
   photos included, just to show a thumbnail or a name. A POS grid asks for
   dozens of thumbnails at once, so the heap filled up.
2. **Droplet settings (this runbook).** The droplet does **not** use the
   API's Dockerfile. `api-02` runs the plain `eclipse-temurin:17-jdk-jammy`
   image with `./api/app.jar` mounted and `command: ["java", "-jar", "app.jar"]`,
   so Java runs on its defaults (heap = 25% of RAM, ~490 MB) with no
   container memory limit. The memory settings therefore go in
   `backend-02/docker-compose.yml`.

Deploy the new jar **and** the compose changes together. The new Java
options make the API exit on `OutOfMemoryError` so `restart: always`
brings it back clean; with the old jar, opening the POS grid would keep
triggering that restart.

### Tested (local, JVM told it has 2 GB)

Test data: 42 items, each with 5 phone photos (~7.6 MB per row). Burst of
114 parallel requests: POS thumbnails, item photos, Items list, Stock
Movements.

| Setup | Result | API memory at peak |
|---|---|---|
| Old jar | 39 of 40 image requests failed (OOM) | n/a |
| Old Java settings (75% heap, ZGC) + fix | all OK | ~2.0 GB (the whole droplet) |
| **Settings below + fix** | **all OK; 10 users on Stock Movements in 0.1 s; full Stock Count flow OK** | **~0.9 GB** |

---

## Step 0: check what is running now

On the droplet:

```bash
free -m
swapon --show
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}'
docker compose version        # must be v2 ("docker compose", not "docker-compose")
```

- **backend-01** also runs on this droplet (it holds port 80). The limits
  below add up to ~2 GB for backend-02 alone (normal use is ~1.3 GB). If
  backend-01 runs another Java API, both will not fit. Check its memory
  in `docker stats` before going on.
- The old `docker-compose` (v1) rejects `mem_limit` in a `version: '3.9'`
  file. Use `docker compose` (v2).

## Step 1: add swap (only if `swapon --show` printed nothing)

A safety net, so a spike swaps instead of the kernel killing a container.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Step 2: back up, then copy the new jar

```bash
cd backend-02
cp docker-compose.yml docker-compose.yml.bak
cp api/app.jar api/app.jar.bak
```

Copy `hrs-sys-mg-api/target/app.jar` to `backend-02/api/app.jar` on the
droplet. It must be built from commit `9020cf9` or later; the current
`target/app.jar` is built from `07ce6c0`, which includes it.

## Step 3: edit `backend-02/docker-compose.yml`

Only these 4 services change. Keep every other line as it is.

### api-02

Replace the `command:` line, add `mem_limit`, and add 3 lines at the end
of `environment:`.

```yaml
    command: ["java",
              "-Xms256m", "-Xmx640m",
              "-XX:MaxMetaspaceSize=256m", "-XX:ReservedCodeCacheSize=96m", "-XX:MaxDirectMemorySize=64m",
              "-XX:+UseSerialGC", "-XX:+ExitOnOutOfMemoryError",
              "-Dserver.tomcat.threads.max=50",
              "-jar", "app.jar"]
    mem_limit: 1100m
    environment:
      # …keep all existing lines, then add:
      HIKARI_MAX_POOL: 25
      SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE: 2
      SPRING_JPA_PROPERTIES_HIBERNATE_QUERY_PLAN_CACHE_MAX_SIZE: "512"
```

What each setting does:

| Setting | Effect |
|---|---|
| `-Xmx640m` | Heap capped at 640 MB (live data measured ~140–250 MB) |
| `-XX:+ExitOnOutOfMemoryError` | On OOM the API exits and `restart: always` restarts it in ~1 min, instead of staying up half-broken |
| `-XX:+UseSerialGC` | Smallest GC overhead on a 1–2 CPU droplet |
| `server.tomcat.threads.max=50` | At most 50 requests run at once, the rest queue |
| `mem_limit: 1100m` | Hard ceiling for the container (heap + metaspace + JIT + threads) |
| `HIKARI_MAX_POOL: 25` | Database connections from the API (default 50) |

### db-02

```yaml
    command: ["postgres",
              "-c", "max_connections=50", "-c", "shared_buffers=128MB",
              "-c", "work_mem=4MB", "-c", "maintenance_work_mem=64MB",
              "-c", "effective_cache_size=512MB"]
    mem_limit: 512m
```

`max_connections=50` covers the API pool (25), the AI agent and psql.

### nginx-02

```yaml
    mem_limit: 64m
```

### hrms-ai-agent

```yaml
    mem_limit: 300m
    environment:
      DB_HOST: db-02
      DB_PORT: 5432
      NODE_OPTIONS: --max-old-space-size=200
```

## Step 4: apply

```bash
cd backend-02
docker compose up -d
```

This recreates the 4 containers. The database restarts for a few seconds;
its data in `./db_data` is kept. The API takes about a minute to start.

## Step 5: verify

```bash
# Heap cap picked up: expect 671088640 (640 MB)
docker exec app-api-02 sh -c 'jcmd 1 VM.flags' | tr ' ' '\n' | grep MaxHeapSize

# Containers under their limits
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}'

# API answers
curl -s localhost:4000/api/v1/health
```

From any client: `https://hr-share.com/api-02/api/v1/health` returns 200.

Then open the POS (or Items) grid with pictures, and Stock Movements, and
confirm they load.

## Rollback

```bash
cd backend-02
cp docker-compose.yml.bak docker-compose.yml
cp api/app.jar.bak api/app.jar
docker compose up -d
```

---

## Also worth doing

- **Postgres is public.** `db-02` publishes `5433:5432`, so the database
  is reachable from the internet. If nothing outside the droplet needs it,
  remove that `ports:` entry, or bind it locally:
  `"127.0.0.1:5433:5432"`.

## Still open (not in this runbook)

**Catalogue loads with inline photos.** These screens load up to 1,000
items with every photo included (no `images=ref`):

- web: Invoices, Bills, Quotations, Vouchers, Consignment, Stock
  Adjustments, Loyalty;
- mobile: Items screen, POS setup.

In testing, one load returned 142 MB, and 3 at once ran a 640 MB heap out
of memory (the API restarted). Real photos may be lighter, but this is the
remaining way to crash the droplet. Fix: request photo links
(`images: 'ref'`) and draw thumbnails with `tileImageOf` / `thumbPath`.
