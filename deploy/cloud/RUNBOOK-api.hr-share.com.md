# Runbook — api.hr-share.com TLS termination

**Purpose**: give the droplet's Spring Boot API a public HTTPS hostname
so Vercel → droplet traffic no longer travels plaintext.

**Closed security audit item**: #1 CRITICAL (Vercel FE proxies HTTPS
to plain HTTP backend).

**Date completed**: 2026-08-13.

---

## Architecture

### Before

```
browser  →HTTPS→  Vercel edge  →HTTP (plaintext internet)→  198.211.108.211:8081
                                                             ↓
                                                     app-nginx-02
                                                     (frontend container,
                                                      served SPA + rewrote
                                                      /api-02/* → backend)
                                                             ↓
                                                     app-api-02:4000
```

Every hop between Vercel and the droplet was plain HTTP. Any transit
peer could sniff a full admin session.

### After

```
browser  →HTTPS→  Vercel edge         →HTTPS→  api.hr-share.com (host nginx :443)
                  vercel.json rewrite:          Let's Encrypt cert
                  /api-02/:path* →                    ↓
                  /api/:path*                   localhost:4000
                                                app-api-02
```

Every hop is TLS. Vercel handles the `/api-02/` → `/api/` prefix
rewrite at the edge, so the droplet nginx just proxies straight to
the backend.

**Container `app-nginx-02` on port 8081 is bypassed for the API path** —
it's still there and still serving the SPA to any direct hits, but the
Vercel edge no longer routes to it.

---

## Deployment steps

Follow in order. Each phase has a verification command; do not proceed
until the previous phase verifies.

### Phase 1 — DNS record on Cloudflare

`hr-share.com` DNS is managed on Cloudflare. Add an `A` record for the
API subdomain:

| Field | Value |
|---|---|
| Type | `A` |
| Name | `api` |
| IPv4 address | `198.211.108.211` |
| Proxy status | **DNS only** (gray cloud) — NOT Proxied (orange) |
| TTL | Auto |

The gray cloud matters: if it's orange, Cloudflare intercepts traffic
and Let's Encrypt's HTTP-01 challenge in Phase 4 will fail with a
connection timeout.

**Verify from any machine (Windows PowerShell):**

```powershell
Resolve-DnsName api.hr-share.com -Type A | Select-Object Name, IPAddress
```

Expected: `198.211.108.211`. Anything Cloudflare-shaped (`104.21.x.x`
or `172.67.x.x`) means the orange cloud is still on.

### Phase 2 — Install certbot on the droplet

SSH in:

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
certbot --version   # should print certbot x.y.z
```

### Phase 3 — nginx site config (HTTP first, cert lands in Phase 4)

Create the site file. HTTP-only at first — certbot adds the HTTPS
listener in the next phase.

```bash
sudo tee /etc/nginx/conf.d/api-hr-share.conf > /dev/null <<'EOF'
# Reverse-proxy for api.hr-share.com → backend Spring Boot (:4000).
# The frontend container on :8081 is bypassed — this hostname goes
# straight to the API. Vercel's rewrite handles the /api-02/ prefix
# at the edge, so nginx just does a straight proxy.
server {
    listen 80;
    listen [::]:80;
    server_name api.hr-share.com;

    # ACME HTTP-01 challenge for Let's Encrypt renewals.
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20m;
        proxy_read_timeout 120s;
    }
}
EOF

sudo nginx -t && sudo nginx -s reload
```

**Verify:**

```bash
curl -i http://api.hr-share.com/api/v1/health
```

Expected: `HTTP/1.1 200` + `{"ok":true,…}`.

### Phase 4 — Let's Encrypt cert via certbot

```bash
sudo certbot --nginx -d api.hr-share.com \
    --agree-tos \
    -m yanchhuongksign@gmail.com \
    --no-eff-email
```

At the "redirect HTTP → HTTPS?" prompt, pick **2** (redirect).

certbot:
- Solves the HTTP-01 challenge via the `.well-known/acme-challenge/`
  path we exposed in Phase 3.
- Writes the cert to `/etc/letsencrypt/live/api.hr-share.com/`.
- Adds `listen 443 ssl` + the SSL directives to
  `/etc/nginx/conf.d/api-hr-share.conf`.
- Adds a 301 redirect from `:80` → `:443`.
- Reloads nginx.
- Registers a systemd timer so the cert auto-renews before expiry.

**Verify:**

```bash
curl -i https://api.hr-share.com/api/v1/health
# expected: HTTP/2 200 + {"ok":true,…}

curl -i http://api.hr-share.com/api/v1/health
# expected: HTTP/1.1 301 + Location: https://api.hr-share.com/…
```

### Phase 5 — Update vercel.json

In `deploy/cloud/../vercel.json` (repo root of the FE):

```json
{
  "rewrites": [
    { "source": "/api-02/:path*", "destination": "https://api.hr-share.com/api/:path*" },
    { "source": "/(.*)",          "destination": "/index.html" }
  ]
}
```

**Important detail on the `/api-02/` → `/api/` rewrite**: the FE's
`api/client.ts` emits URLs like `/api-02/v1/auth/login`. The `/api/`
segment is added by whatever proxy sits in front of the backend. Do
NOT strip `/api-02/` and forward as-is — the backend would receive
`/v1/auth/login` (an unknown route) and Spring Security would 403.
The destination must replace `/api-02/` with `/api/`, not drop it.

Commit and push. Vercel auto-deploys on push to `main` within ~1 min.

**Verify from your local machine:**

```powershell
# PowerShell — note curl.exe, not curl (which is Invoke-WebRequest)
curl.exe -iL https://hr-share.com/api-02/api/v1/health
```

Expected: after the 308 canonical redirect to `www.hr-share.com`,
the second response is `HTTP/2 200` from `Server: Vercel` with
`{"ok":true,…}`.

**Also verify login shape** (not the actual credentials, just that the
endpoint is reachable):

```powershell
curl.exe -iL "https://www.hr-share.com/api-02/v1/auth/login" -X POST -H "Content-Type: application/json" -d "{}"
```

Expected: `HTTP/2 400` (validation failure — no email/password) or
`HTTP/2 401` (bad creds). **NOT** `HTTP/2 403` — a 403 means the URL
still isn't hitting the auth route.

---

## Gotchas encountered

### 1. Two failed attempts before Phase 5 landed correctly

**First attempt** pointed `vercel.json` at `https://hr-share.com/...`.
That's the Vercel-hosted FE itself, so the rewrite looped Vercel to
Vercel. Reverted immediately with `git revert dac961e`.

**Second attempt** (this runbook) points at `api.hr-share.com` — a
separate DNS name that resolves to the droplet, not Vercel.

**Third attempt** used `destination: https://api.hr-share.com/:path*` —
stripped `/api-02/` entirely. Broke login because the FE emits
`/api-02/v1/...` expecting a rewrite to `/api/v1/...`, not just a
prefix strip. Fixed in the next commit.

### 2. Initial nginx path 404

The first test with `curl http://api.hr-share.com/api-02/api/v1/health`
returned a 404 from a *different* nginx (`nginx/1.31.2` in the response
body vs `nginx/1.24.0` in the `Server` header). Root cause: the earlier
nginx config proxied to `localhost:8081` — the frontend container —
which has its own `server_name` rule that didn't match
`api.hr-share.com` and fell through to 404. Fixed by proxying directly
to `localhost:4000` (the backend) instead.

### 3. Windows `curl` isn't real curl

`curl` in PowerShell is an alias for `Invoke-WebRequest`, which has a
completely different syntax. Use `curl.exe` explicitly, or hit Ctrl+C
out of the `Invoke-WebRequest` prompt and use PowerShell-native
`Invoke-WebRequest` syntax. Real curl works normally from Git Bash /
WSL / Linux.

---

## Verifying the fix stayed working (do this monthly)

Cert auto-renews via certbot's systemd timer, but a manual sanity
check every month is worthwhile:

```bash
# On the droplet
sudo certbot certificates
# Expect: expiration date > 30 days from now
```

```powershell
# From any client
curl.exe -iL https://hr-share.com/api-02/api/v1/health
# Expect: HTTP/2 200 + {"ok":true,…}
```

If the cert is within 30 days of expiry and hasn't renewed:

```bash
sudo certbot renew --dry-run   # dry-run first
sudo certbot renew             # if the dry-run succeeded
sudo systemctl reload nginx
```

---

## Rollback

If something breaks after a future change to any layer:

### FE rewrite regression

```bash
cd /path/to/hrs-sys-mg-frontend
git revert <sha of bad vercel.json commit>
git push origin main
```

Vercel serves the previous good build during the ~60s deploy window,
so there's no user-facing downtime.

### Nginx block regression

```bash
sudo rm /etc/nginx/conf.d/api-hr-share.conf
sudo nginx -s reload
```

Then browser + Vercel now fail-fast on `api.hr-share.com` (DNS still
resolves, port 443 nothing serves), which is a clean signal to
re-deploy the config from this runbook.

### Total revert to the original plaintext path

If you need to go back to pre-Aug 2026 shape entirely:

```bash
cd /path/to/hrs-sys-mg-frontend
# open vercel.json and revert the destination to:
#   http://198.211.108.211:8081/api-02/:path*
git commit -am "Revert to pre-TLS API path"
git push origin main
```

This puts you back in the plaintext state the security audit flagged.
Do it only if the TLS path is broken in a way that can't be fixed
faster than this rollback.

---

## Files touched by this work

**FE repo (this file's parent):**
- `vercel.json` — rewrite destination changed to
  `https://api.hr-share.com/api/:path*`.
- `deploy/cloud/RUNBOOK-api.hr-share.com.md` — this file.

**Droplet (not in git):**
- `/etc/nginx/conf.d/api-hr-share.conf` — the server block above.
- `/etc/letsencrypt/live/api.hr-share.com/` — Let's Encrypt cert +
  key. Managed by certbot; do not edit by hand.
- Systemd timer `certbot.timer` — auto-renewal cron.
