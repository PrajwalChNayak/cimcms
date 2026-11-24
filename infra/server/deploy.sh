#!/usr/bin/env bash
# CIMCMS server deploy: builds and runs two Docker containers (API + MQTT broker) and builds the
# web app into the folder your host Nginx serves. Run on the server from anywhere:
#
#   sudo bash infra/server/deploy.sh                  # build + (re)start everything
#   sudo bash infra/server/deploy.sh --web-only       # only rebuild the web app
#   sudo bash infra/server/deploy.sh --no-web         # only the two containers
#
# Settings (environment variables, all optional):
#   REPO_DIR        repository checkout             (default: two folders above this script)
#   NGINX_DIR       folder Nginx serves the web app from      (default: /var/www/cimcms)
#   SECRETS_DIR     folder with api.env and broker.env        (default: /opt/cimcms/secrets)
#   TAG             image tag                       (default: date-time, e.g. 20261124-1530)
#   API_PORT        API port, bound to 127.0.0.1 for Nginx    (default: 3814)
#   MQTT_PORT       public MQTT port                (default: 1883)
#   MQTTS_PORT      public MQTT TLS port, only if BROKER_TLS_CERT is set in broker.env (default: 8883)
#   HEALTH_PORT     broker health check, bound to 127.0.0.1   (default: 8081)
#   GIT_PULL=1      run `git pull --ff-only` first
#
# Secrets live OUTSIDE the repo (chmod 600), never in this script:
#   $SECRETS_DIR/api.env     DATABASE_URL (app DB), BROKER_DATABASE_URL (broker DB), JWT_SECRET_KEY,
#                            MAIN_ROUTE, APP_BASE_URL, MQTT_URL=mqtt://cimcms-broker:1883 (same Docker network),
#                            MQTT_USERNAME/MQTT_PASSWORD (service account), MQTT_PROVISIONING=broker,
#                            MQTT_DEVICE_URL, ... (see infra/prod/api.env.example)
#   $SECRETS_DIR/broker.env  BROKER_DATABASE_URL, optional BROKER_TLS_CERT/BROKER_TLS_KEY
#                            (see apps/broker/.env.example)
# Both containers run their own database migrations at start.
# A Postgres on this host is reachable from the containers as host.docker.internal.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
NGINX_DIR="${NGINX_DIR:-/var/www/cimcms}"
SECRETS_DIR="${SECRETS_DIR:-/opt/cimcms/secrets}"
TAG="${TAG:-$(date +%Y%m%d-%H%M)}"
API_PORT="${API_PORT:-3814}"
MQTT_PORT="${MQTT_PORT:-1883}"
MQTTS_PORT="${MQTTS_PORT:-8883}"
HEALTH_PORT="${HEALTH_PORT:-8081}"
API_NAME=cimcms-api
BROKER_NAME=cimcms-broker
NETWORK=cimcms

DO_CONTAINERS=1; DO_WEB=1
case "${1:-}" in
  --web-only) DO_CONTAINERS=0 ;;
  --no-web) DO_WEB=0 ;;
  "") ;;
  -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
  *) echo "unknown option: $1 (use --web-only, --no-web or --help)" >&2; exit 2 ;;
esac

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
step() { printf '\n\033[36m== %s\033[0m\n' "$*"; }
die() { red "STOP: $*"; exit 1; }

wait_healthy() { # name url seconds
  local name="$1" url="$2" secs="$3"
  for _ in $(seq 1 "$secs"); do
    if curl -fsS "$url" >/dev/null 2>&1; then green "$name is healthy"; return 0; fi
    if ! docker ps --filter "name=^$name$" --format '{{.Status}}' | grep -q '^Up'; then
      red "$name stopped. Last log lines:"; docker logs --tail 40 "$name" || true; return 1
    fi
    sleep 1
  done
  red "$name not healthy after ${secs}s. Last log lines:"; docker logs --tail 40 "$name" || true
  return 1
}

step "Checks"
command -v docker >/dev/null || die "docker is not installed"
[ -f "$REPO_DIR/apps/api/Dockerfile" ] && [ -f "$REPO_DIR/apps/broker/Dockerfile" ] || die "repository not found at $REPO_DIR (set REPO_DIR)"
if [ "$DO_CONTAINERS" = 1 ]; then
  [ -f "$SECRETS_DIR/api.env" ] || die "$SECRETS_DIR/api.env missing (copy infra/prod/api.env.example, fill it, chmod 600)"
  [ -f "$SECRETS_DIR/broker.env" ] || die "$SECRETS_DIR/broker.env missing (copy apps/broker/.env.example, fill it, chmod 600)"
fi
echo "repo: $REPO_DIR   tag: $TAG   web -> $NGINX_DIR"

if [ "${GIT_PULL:-0}" = 1 ]; then
  step "git pull"
  git -C "$REPO_DIR" pull --ff-only
fi

if [ "$DO_CONTAINERS" = 1 ]; then
  step "1. Build images"
  docker build -f "$REPO_DIR/apps/broker/Dockerfile" -t "$BROKER_NAME:$TAG" -t "$BROKER_NAME:latest" "$REPO_DIR"
  docker build -f "$REPO_DIR/apps/api/Dockerfile" -t "$API_NAME:$TAG" -t "$API_NAME:latest" "$REPO_DIR"
  green "images built: $BROKER_NAME:$TAG, $API_NAME:$TAG"

  docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null

  step "2. Broker container"
  docker rm -f "$BROKER_NAME" >/dev/null 2>&1 || true
  TLS_PORT_ARGS=()
  if grep -Eq '^BROKER_TLS_CERT=.+' "$SECRETS_DIR/broker.env"; then TLS_PORT_ARGS=(-p "$MQTTS_PORT:8883"); fi
  docker run -d --name "$BROKER_NAME" --restart unless-stopped \
    --network "$NETWORK" --add-host host.docker.internal:host-gateway \
    --env-file "$SECRETS_DIR/broker.env" \
    -p "$MQTT_PORT:1883" "${TLS_PORT_ARGS[@]}" -p "127.0.0.1:$HEALTH_PORT:8081" \
    --log-opt max-size=10m --log-opt max-file=5 \
    "$BROKER_NAME:$TAG" >/dev/null
  wait_healthy "$BROKER_NAME" "http://127.0.0.1:$HEALTH_PORT/health" 90 || die "broker did not start"

  step "3. API container"
  docker rm -f "$API_NAME" >/dev/null 2>&1 || true
  docker run -d --name "$API_NAME" --restart unless-stopped \
    --network "$NETWORK" --add-host host.docker.internal:host-gateway \
    --env-file "$SECRETS_DIR/api.env" \
    -e PORT=3814 \
    -p "127.0.0.1:$API_PORT:3814" \
    --log-opt max-size=10m --log-opt max-file=5 \
    "$API_NAME:$TAG" >/dev/null
  wait_healthy "$API_NAME" "http://127.0.0.1:$API_PORT/health/ready" 120 || die "API did not start (check DATABASE_URL / MQTT settings in api.env)"
fi

if [ "$DO_WEB" = 1 ]; then
  step "4. Build the web app (inside a Node container: no Node needed on the server)"
  docker run --rm \
    -v "$REPO_DIR:/repo" -w /repo \
    -e VITE_API_BASE_URL=/api -e VITE_FF_CIMCMS=true \
    node:20 sh -c "npm ci --no-audit --no-fund && npm run build:contracts && npm exec -w apps/web -- vite build --outDir /repo/apps/web/dist --emptyOutDir"
  [ -f "$REPO_DIR/apps/web/dist/index.html" ] || die "web build produced no index.html"

  step "5. Publish to $NGINX_DIR"
  # Copy to a new folder next to the target, then swap: Nginx never serves a half-copied app.
  parent="$(dirname "$NGINX_DIR")"
  mkdir -p "$parent"
  staging="$NGINX_DIR.new-$TAG"
  rm -rf "$staging"
  cp -a "$REPO_DIR/apps/web/dist" "$staging"
  if [ -d "$NGINX_DIR" ]; then
    rm -rf "$NGINX_DIR.previous"
    mv "$NGINX_DIR" "$NGINX_DIR.previous"
  fi
  mv "$staging" "$NGINX_DIR"
  chmod -R a+rX "$NGINX_DIR"
  green "web app published (previous version kept in $NGINX_DIR.previous)"

  if command -v nginx >/dev/null 2>&1; then
    if nginx -t >/dev/null 2>&1; then
      (systemctl reload nginx 2>/dev/null || nginx -s reload) && green "nginx reloaded"
    else
      red "nginx -t failed: fix the Nginx config, then reload it (the files are already in place)"
    fi
  fi
fi

step "Done"
[ "$DO_CONTAINERS" = 1 ] && docker ps --filter "name=cimcms-" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
cat <<EOF

Nginx needs (inside your server { } block; replace <MAIN_ROUTE> with MAIN_ROUTE from api.env):
    root $NGINX_DIR;
    location / { try_files \$uri /index.html; }
    location /api/ { proxy_pass http://127.0.0.1:$API_PORT/<MAIN_ROUTE>/; proxy_set_header Host \$host;
                     proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
    location /socket.io/ { proxy_pass http://127.0.0.1:$API_PORT; proxy_http_version 1.1;
                           proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host \$host; }
Roll back the web app:  mv $NGINX_DIR $NGINX_DIR.bad && mv $NGINX_DIR.previous $NGINX_DIR
Roll back containers:   TAG=<previous tag> ... or: docker images cimcms-api / cimcms-broker
EOF
