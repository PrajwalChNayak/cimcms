# Runbook: deploy CIMCMS (T4.5, HUMAN-ONLY execution)

An operator runs this on the production server. No automated agent may SSH to the server or touch the live Mosquitto broker. Related: `infra/prod/docker-compose.yml`, `infra/prod/nginx/cimcms.conf`, `docs/runbooks/mosquitto-hardening.md`, `docs/runbooks/backup-restore.md`.

Placeholders (replace yourself, never write real values into Git, chat or tickets): `<domain>` the public host name, `<tag>` the image tag (for example `2025.01.15-1`), `<repo>` the checkout on the server (for example `/opt/cimcms/repo`), `<broker-host>` the existing Mosquitto host, `<admin-email>` the first admin's e-mail, `<deploy-user>` the operator account.

Design rules to keep in mind: exactly ONE `api` container (never scale it, never enable pm2 cluster mode: it would duplicate MQTT ingestion); mongo is never published to the host; same-origin deployment (`/` SPA, `/api/`, `/socket.io/`).

## 1. Server prerequisites

- Linux server with a public IP and a DNS `A` record `<domain>` pointing to it.
- Docker Engine and the compose plugin (`docker compose version`).
- Firewall: allow inbound 80 and 443 (web). 8883 is on the broker host (see the Mosquitto runbook). Do **not** open 27017 or 3814.
- SSH access by key only for the operators.
- `git` to fetch this repository; the deploy user is in the `docker` group.
- Mosquitto hardening (`mosquitto-hardening.md`) done first: accounts `cimcms-backend` and `LED-01` exist and the 8883 TLS listener works.

## 2. Build or obtain images

Images are built from the repo root and tagged locally; nothing is pushed anywhere by these steps.

```bash
cd <repo>
docker build -f apps/api/Dockerfile -t cimcms-api:<tag> .
docker build -f apps/web/Dockerfile -t cimcms-web:<tag> .
# expect no .env file in the api image:
docker run --rm --entrypoint sh cimcms-api:<tag> -c 'ls -la; find / -name ".env*" -not -path "*/node_modules/*" 2>/dev/null'
```

If the owner later provides a registry, `docker pull` the same tags instead and record the registry here.

## 3. First install

### 3.1 Secrets (outside the repo, mode 600)

```bash
sudo install -d -m 700 -o <deploy-user> /opt/cimcms/secrets
cd /opt/cimcms/secrets
cp <repo>/infra/prod/api.env.example api.env
cp <repo>/infra/prod/mongo.env.example mongo.env
openssl rand -base64 756 | tr -d '\n' > mongo-keyfile      # Mongo replica-set keyfile
chmod 600 api.env mongo.env mongo-keyfile
```

Edit `api.env` and `mongo.env` and replace every `<placeholder>`:

- `JWT_SECRET_KEY`, `SESSION_SECRET_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` or `openssl rand -base64 32`.
- Mongo root user and password in `mongo.env`; the same user and password in `DATABASE_URL` of `api.env` (URL-encode special characters). Database name `cimcms`.
- `APP_BASE_URL=https://<domain>`, `MQTT_URL=mqtts://<broker-host>:8883`, `MQTT_USERNAME=cimcms-backend`, `MQTT_PASSWORD` from the password manager, `MQTT_CLIENT_ID=cimcms-backend` (must differ from dev).
- `API_DOCS_ENABLED=false`, `REFRESH_COOKIE_PATH=/api/user/token`, `MAIN_ROUTE` equal to the value in `infra/prod/.env` (default `api/v1`).
- Docker env files do not strip quotes: write values without quotes.

Store a copy of the secrets in the encrypted store (`backup-restore.md` section 5).

The compose file copies the keyfile inside the mongo container and sets the owner and mode itself, so no `chown` on the host is needed.

### 3.2 Deployment parameters

```bash
cd <repo>/infra/prod
cp .env.example .env        # git-ignored; set DOMAIN=<domain>, CIMCMS_TAG=<tag>, MAIN_ROUTE (same as api.env)
```

### 3.3 Certificate (certbot webroot)

Nginx needs the certificate files to start, but the webroot challenge needs Nginx on port 80. Issue the first certificate with certbot standalone (port 80 must be free, so before the first `up`), then switch renewals to the webroot served by the web container:

```bash
sudo apt-get install -y certbot            # or the distribution's equivalent
sudo mkdir -p /var/www/certbot
sudo certbot certonly --standalone -d <domain>
```

Then set renewals to the webroot method (in `/etc/letsencrypt/renewal/<domain>.conf` set `authenticator = webroot` and under `[renewalparams]` `webroot_path = /var/www/certbot`) and add a deploy hook that reloads Nginx (replace `<repo>` with the real path in the file):

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/cimcms-reload.sh >/dev/null <<'HOOK'
#!/bin/sh
cd <repo>/infra/prod && docker compose exec -T web nginx -s reload
HOOK
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/cimcms-reload.sh
```

After step 3.4 prove the renewal path: `sudo certbot renew --dry-run`. Certificates are bind-mounted read-only from `/etc/letsencrypt`.

### 3.4 Start the stack

```bash
cd <repo>/infra/prod
docker compose config >/dev/null && echo config ok
docker compose up -d
docker compose ps
docker compose logs --tail 50 mongo api
```

Expected: `mongo` becomes healthy (it initiates replica set `rs0` itself on first start; allow up to about a minute), then `api` and `web` start. `docker compose ps` shows no published port for `mongo` and `api`; only `web` has 80 and 443.

The `api` healthcheck calls `/health/ready` (plan task T2.10). Until the image contains that endpoint the `api` container reports `unhealthy`; this does not stop `web`.

### 3.5 Seed data

The compiled seed scripts are in the image (idempotent, safe to repeat). Run them inside the api container:

```bash
cd <repo>/infra/prod
docker compose exec api node dist/src/models/seed.js            # permissions, roles, devices from SEED_DEVICES
```

First admin user: add `BOOTSTRAP_ADMIN_PASSWORD=<min-12-chars>` to `/opt/cimcms/secrets/api.env` temporarily, then:

```bash
docker compose up -d api    # recreate the container so the env file is re-read
docker compose exec api node dist/src/models/seed-admin.js --email <admin-email>
```

Remove `BOOTSTRAP_ADMIN_PASSWORD` from `api.env` again and run `docker compose up -d api`. Seed devices come from `SEED_DEVICES` in `api.env` (default `LED-01:LED_CONTROLLER:LED Controller 1`); re-run `seed.js` after editing it. Do not invent other device IDs.

(`npm run seed` / `seed:admin` need dev tooling and TypeScript sources that are not in the runtime image; the compiled files above are the supported way.)

### 3.6 Schedule backups

Follow `docs/runbooks/backup-restore.md` section 2 and run one backup now.

## 4. Update procedure

1. Back up first: `cd <repo>/infra/prod && ./scripts/backup-mongo.sh`.
2. Note the current tag (`grep CIMCMS_TAG .env`); it is the rollback target.
3. `cd <repo> && git fetch && git checkout <release-ref>`.
4. Build or pull the new images with tag `<new-tag>` (section 2). Keep the previous images on the server.
5. Set `CIMCMS_TAG=<new-tag>` in `infra/prod/.env`.
6. `docker compose up -d` (recreates `api` and `web`; mongo is untouched unless its definition changed).
7. Check: `docker compose ps`; `docker compose logs --tail 100 api`; `curl -fsS https://<domain>/api/health/ready` (once the endpoint exists); open the site and log in.
8. Run the smoke checklist (section 6) when the release changes behaviour.

Schema changes: the API creates the time-series collection at start (idempotent). If a release adds Prisma models or indexes, the release notes must give the exact command; take the backup in step 1 first. Never run `prisma db push --accept-data-loss` against production.

## 5. Rollback

```bash
cd <repo>/infra/prod
# set CIMCMS_TAG=<previous-tag> in .env
docker compose up -d
docker compose ps
```

The previous images are still local. If the failed release changed data incompatibly, stop `api` and restore the pre-update backup (`backup-restore.md` section 3.1). For certificate or Nginx problems: `docker compose logs web` and `docker compose exec web nginx -t`.

## 6. Smoke test checklist (FRS acceptance criteria, plan section 11)

Run from a normal browser (desktop and phone) and on the server. Record date, tag and result per line.

- [ ] HTTPS login works for an internal user; HTTP redirects to HTTPS; the certificate is valid; a page reload keeps the session (refresh cookie).
- [ ] No MQTT credentials, JWT secrets or broker details reach the browser (page source, network tab); `curl -I https://<domain>/` shows HSTS and CSP headers.
- [ ] `https://<domain>/api/user/me` without login returns 401 JSON; `/api-docs` is not served.
- [ ] WebSocket `/socket.io/` connects (the devices page updates live without refresh).
- [ ] Device `LED-01` appears; ONLINE/OFFLINE follows the physical device. Simulation mode stays ON: never change firmware `RELAY_SIMULATION_MODE`, never disable relay channels.
- [ ] A relay command from the UI is acknowledged and its result shown (success and timeout paths), per FRS 7.2.
- [ ] A user without the permission cannot send commands; permissions gate the navigation.
- [ ] History pages show telemetry in `Asia/Kolkata` time.
- [ ] The existing Humidifier still reports on `cimcms/humidifier/<id>/status` and is undisturbed (`mosquitto-hardening.md` step 10).
- [ ] After `docker compose restart` of the whole stack everything returns without manual steps.
- [ ] A backup file exists and `gzip -t` passes (`backup-restore.md` section 2).
- [ ] `docker compose ps`: only `web` publishes ports (80, 443); `ss -ltn` on the host shows no 27017 or 3814.

Record the completed run in `docs/PROGRESS.md`. A full dry run on a staging VM is recommended before the first real install.
