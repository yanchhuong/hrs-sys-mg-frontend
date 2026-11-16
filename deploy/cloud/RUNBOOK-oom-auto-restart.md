# Runbook: restart automatically when a container runs out of memory

**Purpose:** when the API (or another container) on the droplet runs out of
memory, it should come back by itself within a minute or two, with no one
logging in to restart it.

**Applies to:** `backend-02` on the droplet (`api-02`, `db-02`, `nginx-02`,
`hrms-ai-agent`) and the template stack in this folder
(`deploy/cloud/docker-compose.yml`).

**Read first:** [RUNBOOK-2gb-droplet-memory.md](RUNBOOK-2gb-droplet-memory.md).
It sets the memory limits and Java options. This runbook covers what
happens when those limits are hit, and how to make the restart reliable.

---

## 1. The 3 ways a container runs out of memory

| # | What happens | Does the container exit? | Restarted by `restart:`? |
|---|---|---|---|
| A | **Java heap full.** Java throws `OutOfMemoryError`. With `-XX:+ExitOnOutOfMemoryError` it prints `Terminating due to java.lang.OutOfMemoryError` and exits with code 3. | Yes | **Yes** |
| B | **Container over `mem_limit`.** The kernel kills the process (exit code 137, `OOMKilled=true`). | Yes | **Yes** |
| C | **Almost full, but no error.** Java spends nearly all its time cleaning memory; requests hang and the site stays on "pending". Serial GC has no "too much time in GC" check, so no error is ever thrown. Threads stuck on a slow query look the same. | **No** | **No.** Docker marks it `unhealthy`, but plain Docker (not Swarm) never restarts an unhealthy container. |

- A and B are already handled by the restart policy plus the Java options
  from the 2 GB runbook.
- **C is the gap.** It needs a health check plus something that restarts
  unhealthy containers (section 4).

Without `-XX:+ExitOnOutOfMemoryError`, case A turns into case C: Java
stays alive after the error and the site hangs. That is what happened
before; keep that flag.

---

## 2. Restart policy (cases A and B)

Every service in the compose file needs one of these:

```yaml
    restart: unless-stopped     # or: always
```

| Policy | After a crash or OOM | After `docker stop`, then a droplet reboot |
|---|---|---|
| `always` | restarts | starts again |
| `unless-stopped` | restarts | stays stopped |
| `on-failure` | restarts (exit code ≠ 0) | starts again |
| `no` (the default) | **stays down** | stays down |

Either `always` or `unless-stopped` is fine. `backend-02` uses `always`,
and the template uses `unless-stopped`.

**How fast:**
- If a container keeps crashing, Docker waits 0.1 s before the first
  restart and doubles the wait each time, up to 1 minute.
- The wait resets once the container has stayed up for 10 seconds.
- The API then needs about a minute to start, so the site is back about
  1–2 minutes after an OOM.

**After a droplet reboot:** restart policies only work if Docker itself
starts at boot:

```bash
sudo systemctl is-enabled docker      # must print: enabled
sudo systemctl enable docker          # if it does not
```

---

## 3. Memory settings that make the restart clean

These go in `backend-02/docker-compose.yml`. Most are already in the
2 GB runbook; the new ones are marked **new**.

### api-02

```yaml
  api-02:
    restart: always
    command: ["java",
              "-Xms256m", "-Xmx640m",
              "-XX:MaxMetaspaceSize=256m", "-XX:ReservedCodeCacheSize=96m", "-XX:MaxDirectMemorySize=64m",
              "-XX:+UseSerialGC", "-XX:+ExitOnOutOfMemoryError",
              "-Dserver.tomcat.threads.max=50",
              "-jar", "app.jar"]
    mem_limit: 1100m
    memswap_limit: 1100m        # new: no swap for the API (see below)
    healthcheck:                # new: see section 4
      ...
```

**Why `memswap_limit: 1100m`:**
- When the droplet has swap (the 2 GB runbook adds 2 GB), a container with
  only `mem_limit` can also use swap up to the same size again, 1100 MB here.
- Java's heap in swap makes every GC pause very slow, so the API looks like
  case C (hung) instead of failing fast.
- Setting `memswap_limit` equal to `mem_limit` gives the API no swap, so it
  hits case A or B and restarts.
- Swap stays available to Postgres, the AI agent and the OS.

**Do not** set `oom_kill_disable: true`. With it, a container over its limit
freezes instead of being killed.

### db-02: protect the database (new)

If the whole droplet runs short (not just one container), the kernel picks
the process to kill by score. Make it pick the API rather than Postgres:

```yaml
  db-02:
    restart: always
    mem_limit: 512m
    oom_score_adj: -500         # new: kill the API before the database
```

The API restarts in about a minute. Postgres being killed means crash
recovery and every connection dropped.

### hrms-ai-agent

Node exits by itself when its heap is full (exit code 134), so
`restart: always` plus the existing settings is enough:

```yaml
    mem_limit: 300m
    environment:
      NODE_OPTIONS: --max-old-space-size=200
```

---

## 4. Restart a hung API (case C)

Two parts: a health check that notices the hang, and a small job that
restarts any container marked `unhealthy`.

### 4a. Health check on api-02

The API's own Dockerfile has a health check, but the droplet does **not**
use that image. `api-02` runs plain `eclipse-temurin:17-jdk-jammy` with the
jar mounted, so it has no health check yet. Add one.

First see which HTTP tool the image has:

```bash
docker exec app-api-02 sh -c 'command -v curl wget bash'
```

If `curl` is there:

```yaml
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS -m 5 http://localhost:4000/api/v1/health >/dev/null || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 120s
```

If only `bash` is there (no curl or wget):

```yaml
    healthcheck:
      test: ["CMD", "bash", "-c", 'exec 3<>/dev/tcp/127.0.0.1/4000 && printf "GET /api/v1/health HTTP/1.0\r\n\r\n" >&3 && timeout 5 head -1 <&3 | grep -q " 200"']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 120s
```

| Setting | Meaning |
|---|---|
| `interval: 30s` | Check every 30 s |
| `timeout: 10s` | A check slower than 10 s counts as a failure |
| `retries: 3` | 3 failures in a row → `unhealthy` (about 1.5 min of hanging) |
| `start_period: 120s` | Failures in the first 2 min don't count (startup + Flyway) |

**What it covers:** `/api/v1/health` does not touch the database. So:
- It **does** fail when Java is frozen or all 50 request threads are stuck,
  which is case C.
- It does **not** fail when only Postgres is down. That is intended:
  restarting the API would not fix the database, and would just loop.

### 4b. Restart whatever is unhealthy (cron on the droplet)

Plain Docker only *reports* `unhealthy`. A cron job on the droplet does the
restart. It needs no extra container and no access to the Docker socket
from inside a container.

```bash
sudo tee /usr/local/bin/docker-restart-unhealthy >/dev/null <<'EOF'
#!/bin/sh
# Restart every container whose health check says "unhealthy".
for id in $(docker ps -q --filter health=unhealthy); do
  name=$(docker inspect -f '{{.Name}}' "$id")
  logger -t docker-heal "restarting unhealthy container $name"
  docker restart -t 20 "$id"
done
EOF
sudo chmod +x /usr/local/bin/docker-restart-unhealthy

# every minute
( sudo crontab -l 2>/dev/null; echo '* * * * * /usr/local/bin/docker-restart-unhealthy' ) | sudo crontab -
```

`docker restart -t 20` asks Java to stop and waits 20 s, then force-kills it.

It acts only on containers that have a health check (`db-02` and `api-02`).
Containers without one are never touched.

To see what it did: `journalctl -t docker-heal --since today`.

> **Alternative:** the `willfarrell/autoheal` container does the same job,
> but it needs `/var/run/docker.sock` mounted, which gives that container
> full control of Docker on the droplet. The cron job above avoids that.

---

## 5. Apply

```bash
cd ~/app/backend-02
cp docker-compose.yml docker-compose.yml.bak
# edit docker-compose.yml (sections 3 and 4a)
docker compose config -q && docker compose up -d   # check the file, then recreate changed containers
```

Then set up the cron job from 4b once.

---

## 6. Check that it works

### Status at any time

```bash
# Restart count, whether the last stop was an OOM kill, exit code, start time
docker inspect -f '{{.Name}}  restarts={{.RestartCount}}  oom={{.State.OOMKilled}}  exit={{.State.ExitCode}}  health={{if .State.Health}}{{.State.Health.Status}}{{end}}  since={{.State.StartedAt}}' \
  $(docker ps -aq)

# Memory now
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}'
```

- `RestartCount` goes back to 0 whenever `docker compose up` recreates the
  container.
- `exit=3` means the Java heap ran out (case A). `exit=137` together with
  `oom=true` means the container went over `mem_limit` (case B).

### Find out why it restarted

```bash
docker logs --since 2h app-api-02 2>&1 | grep -iE 'OutOfMemoryError|Terminating due to'
sudo dmesg -T | grep -iE 'killed process|oom-kill'        # kernel kills (case B, or the whole droplet short)
docker events --since 24h --until "$(date +%s)" --filter event=oom --filter event=die --filter event=health_status
```

### Drill (do it at a quiet hour: the API is down for 1–2 min)

**Crash → restart** (like A or B). This kills Java from the host, which is
what an OOM kill looks like to Docker:

```bash
sudo kill -9 $(docker inspect -f '{{.State.Pid}}' app-api-02)
watch -n 5 "docker ps --filter name=app-api-02 --format '{{.Status}}'"
# expect "Up 10 seconds (health: starting)" → "(healthy)" within ~2 min
```

Don't test with `docker stop` or `docker kill`. Docker treats both as a
manual stop, and may not restart the container afterwards.

**Hang → restart** (case C). This freezes Java without killing it:

```bash
sudo kill -STOP $(docker inspect -f '{{.State.Pid}}' app-api-02)
# after ~1.5 min: health=unhealthy; within 1 more min the cron job restarts it
journalctl -t docker-heal -f
```

If the cron job is not set up yet, undo the freeze with
`sudo kill -CONT <same pid>`.

---

## Rollback

```bash
cd ~/app/backend-02
cp docker-compose.yml.bak docker-compose.yml
docker compose up -d
sudo crontab -l | grep -v docker-restart-unhealthy | sudo crontab -
```

---

## Also worth doing

- **Log size.** Every restart writes a startup log, and Docker's default
  log driver never rotates. Cap it per service so the disk can't fill:

  ```yaml
      logging:
        driver: json-file
        options: { max-size: "10m", max-file: "3" }
  ```

- **Repeated OOM restarts mean a real leak or a heavy screen.** The open
  item in the 2 GB runbook (catalogue screens loading every photo inline)
  is the known cause. Restarting hides it but doesn't fix it.
