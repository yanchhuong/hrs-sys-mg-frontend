# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the HRMS Vite SPA. Build with Node, serve via
# nginx-alpine. The browser hits relative /api paths and nginx proxies
# them to the api service inside the docker network — no CORS dance.

# ----- Stage 1: build --------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Cache deps independently of source. `npm install` (not `npm ci`)
# because the committed lockfile drifts from package.json on this repo
# — `npm install` regenerates it; `npm ci` would refuse to start.
COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

# Build with the API base set to a relative '/api' so the served HTML
# works regardless of the host port — nginx (next stage) handles the
# proxy. Override at build-time with --build-arg if you want absolute.
ARG VITE_API_BASE=
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# ----- Stage 2: runtime ------------------------------------------------------
FROM nginx:1.27-alpine AS runner

# Replace the default config with our SPA + /api proxy config.
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
