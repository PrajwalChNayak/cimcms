# Runbook: deploy CIMCMS (T4.5, HUMAN-ONLY execution)

An operator runs this on the production server. No automated agent may SSH to the server or touch the live MQTT broker. Related: `infra/prod/docker-compose.yml`, `infra/prod/nginx/cimcms.conf`, `docs/runbooks/broker.md` (own MQTT broker; `mosquitto-hardening.md` is superseded), `docs/runbooks/backup-restore.md`.

Placeholders (replace yourself, never write real values into Git, chat or tickets): `<domain>` the public host name, `<tag>` the image tag (for example `2025.01.15-1`), `<repo>` the checkout on the server (for example `/opt/cimcms/repo`), `<broker-host>` the public MQTT host name (on the broker certificate, for example `mqtt.<domain>`), `<admin-email>` the first admin's e-mail, `<deploy-user>` the operator account.

Design rules to keep in mind: exactly ONE `api` container (never scale it, never enable pm2 cluster mode: it would duplicate MQTT ingestion); postgres is never published to the host; same-origin deployment (`/` SPA, `/api/`, `/socket.io/`).

## 1. Server prerequisites

- Linux server with a public IP and a DNS `A` record `<domain>` pointing to it.
- Docker Engine and the compose plugin (`docker compose version`).
- Firewall: allow inbound 80 and 443 (web) and 8883 (MQTTS, service `broker`); 1883 only while plain-MQTT devices such as the Humidifier still need it. Do **not** open 5432, 3814 or 8081.
- SSH access by key only for the operators.
- `git` to fetch this repository; the deploy user is in the `docker` group.
- MQTT: the stack includes the own broker (service `broker`, `docs/runbooks/broker.md`); logins live in the database table `MqttAccount` and are created after the first start (section 3.5). A certificate for `<broker-host>` (`MQTT_DOMAIN` in `.env`, default `DOMAIN`) readable by uid 1000 (`broker.md`, TLS). On the current server that still runs Mosquitto, follow `infra/server-broker/README.md` instead.

## 2. Build or obtain images

Images are built from the repo root and tagged locally; nothing is pushed anywhere by these steps.

```bash
cd <repo>
docker build -f apps/api/Dockerfile -t cimcms-api:<tag> .
docker build -f apps/web/Dockerfile -t cimcms-web:<tag> .
docker build -f apps/broker/Dockerfile -t cimcms-broker:<tag> .
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
cp <repo>/infra/prod/postgres.env.example postgres.env
cp <repo>/infra/prod/broker.env.example broker.env
chmod 600 api.env postgres.env broker.env
```

Edit `api.env`, `postgres.env` and `broker.env` and replace every `<placeholder>`:

- `JWT_SECRET_KEY`, `SESSION_SECRET_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` or `openssl rand -base64 32`.
- Postgres user, password and database (`cimcms`) in `postgres.env`; the same user/password in `DATABASE_URL` of `api.env` (`postgresql://<user>:<password>@postgres:5432/cimcms?schema=public`) and in `BROKER_DATABASE_URL` of `api.env` and `broker.env` (`postgresql://<user>:<password>@postgres:5432/cimcms_broker?schema=public`; the broker has its own database, PROGRESS D27). URL-encode special characters in the password.
- The broker database `cimcms_broker` is created by `infra/prod/postgres-init/create-broker-db.sql` when the postgres volume is NEW (first start). On an existing volume create it by hand once: `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE cimcms_broker"'`.
- `APP_BASE_URL=https://<domain>`, `MQTT_URL=mqtt://broker:1883` (the API reaches the broker over the private compose network), `MQTT_USERNAME=cimcms-backend`, `MQTT_PASSWORD` from section 3.5 (password manager), `MQTT_CLIENT_ID=cimcms-backend` (must differ from dev).
- Device broker accounts: `MQTT_PROVISIONING=broker` (default): adding a device in the web app creates its login in `MqttAccount`, shows the password once, and Reset password / delete work from the device page. `MQTT_DEVICE_URL=mqtts://<broker-host>:8883` is the public address the web app shows with each device account. There are no `MQTT_ADMIN_*` settings any more. `manual` is only for an external broker.
- `API_DOCS_ENABLED=false`, `REFRESH_COOKIE_PATH=/api/user/token`, `MAIN_ROUTE` equal to the value in `infra/prod/.env` (default `api/v1`).
- Docker env files do not strip quotes: write values without quotes.

Store a copy of the secrets in the encrypted store (`backup-restore.md` section 5).

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
docker compose logs --tail 50 postgres api broker
```

Expected: `postgres` becomes healthy (on a new volume it also creates `cimcms_broker`), then `api` starts: its entrypoint first runs `prisma migrate deploy` on the app database (the log lists the applied migrations), then the API. `broker` starts once postgres is healthy: its entrypoint runs `prisma migrate deploy` on the broker database (`apps/broker/prisma/migrations`), then the broker. Then `web` starts. `docker compose ps` shows no published port for `postgres` and `api`; `web` has 80 and 443, `broker` 1883 and 8883.

The `api` healthcheck calls `/health/ready` (database and broker reachable). The `broker` healthcheck calls `GET /health` on port 8081 inside the container (`docker compose exec broker curl -fsS http://localhost:8081/health`).

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

Broker logins (`docs/runbooks/broker.md`, Accounts):

```bash
docker compose exec api node dist/src/models/mqtt-account.js --username cimcms-backend --kind service   # prints the password once: put it in api.env MQTT_PASSWORD
docker compose exec -e MQTT_ACCOUNT_PASSWORD='<humidifier password>' api node dist/src/models/mqtt-account.js --username mqttuser --kind legacy   # only if the Humidifier connects to this broker
docker compose up -d api    # re-read api.env
```

Device logins (for example `LED-01`) come from the web app: open the device, Reset password, and enter the new password on the device.

(`npm run seed` / `seed:admin` need dev tooling and TypeScript sources that are not in the runtime image; the compiled files above are the supported way.)

### 3.6 Schedule backups

Follow `docs/runbooks/backup-restore.md` section 2 and run one backup now.

## 4. Update procedure

1. Back up first: `cd <repo>/infra/prod && ./scripts/backup-postgres.sh`.
2. Note the current tag (`grep CIMCMS_TAG .env`); it is the rollback target.
3. `cd <repo> && git fetch && git checkout <release-ref>`.
4. Build or pull the new images with tag `<new-tag>` (section 2). Keep the previous images on the server.
5. Set `CIMCMS_TAG=<new-tag>` in `infra/prod/.env`.
6. `docker compose up -d` (recreates `api`, `broker` and `web`; clients reconnect to the broker within seconds; postgres is untouched unless its definition changed). The new `api` container applies pending app migrations and the new `broker` container pending broker migrations before they start.
7. Check: `docker compose ps`; `docker compose logs --tail 100 api`; `docker compose exec api curl -fsS http://localhost:3814/health/ready`; open the site and log in.
8. Run the smoke checklist (section 6) when the release changes behaviour.

Schema changes ship as Prisma migration files: app database `apps/api/src/models/tables/migrations` (api entrypoint), broker database `apps/broker/prisma/migrations` (broker entrypoint); both run `prisma migrate deploy`. Take the backup in step 1 first. Never run `prisma db push`, `migrate dev` or `migrate reset` against production. To check state: `docker compose exec api node node_modules/prisma/build/index.js migrate status --schema ./prisma/schema.prisma` and `docker compose exec broker node node_modules/prisma/build/index.js migrate status --schema ./prisma/schema.prisma`.

### Upgrade to the separate broker database (first release with PROGRESS D27)

Older releases kept `MqttAccount` / `MqttRetained` in the app database `cimcms`; the new api migration `20261124090000_move_broker_tables_out` drops them there. Copy the rows first, in this order:

1. Backup (step 1 above). Add `BROKER_DATABASE_URL` to `api.env` and replace `DATABASE_URL` with `BROKER_DATABASE_URL` in `broker.env` (section 3.1).
2. Create the broker database (existing volume): `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE cimcms_broker"'`.
3. Set the new `CIMCMS_TAG`, then start ONLY the new broker so it creates its tables: `docker compose up -d --no-deps broker` (check `docker compose logs broker` for the applied migration). Do not start the new api yet.
4. Copy the rows (the old tables still exist because the new api has not run):
   ```bash
   docker compose exec -T postgres sh -c 'pg_dump --data-only --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t "\"MqttAccount\"" -t "\"MqttRetained\"" | psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d cimcms_broker'
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d cimcms_broker -c "SELECT count(*) FROM \"MqttAccount\""'
   ```
5. `docker compose up -d` (the new api drops the old tables), `docker compose restart broker` (reloads retained messages), then step 7.

## 5. Rollback

```bash
cd <repo>/infra/prod
# set CIMCMS_TAG=<previous-tag> in .env
docker compose up -d
docker compose ps
```

The previous images are still local. Migrations only move forward: rolling back the image does not undo a migration. If the failed release changed the schema or data incompatibly, stop `api` and restore the pre-update backup (`backup-restore.md` section 3.1) before starting the previous image. For certificate or Nginx problems: `docker compose logs web` and `docker compose exec web nginx -t`.

## 6. Smoke test checklist (FRS acceptance criteria, plan section 11)

Run from a normal browser (desktop and phone) and on the server. Record date, tag and result per line.

- [ ] HTTPS login works for an internal user; HTTP redirects to HTTPS; the certificate is valid; a page reload keeps the session (refresh cookie).
- [ ] No MQTT credentials, JWT secrets or broker details reach the browser (page source, network tab); `curl -I https://<domain>/` shows HSTS and CSP headers. The only intended exceptions: with `MQTT_PROVISIONING=broker`, a device's own new password is shown once to the admin who adds the device or resets its password, and `MQTT_DEVICE_URL` is shown with the device account. The backend MQTT credentials must never appear.
- [ ] `https://<domain>/api/user/me` without login returns 401 JSON; `/api-docs` is not served.
- [ ] WebSocket `/socket.io/` connects (the devices page updates live without refresh).
- [ ] Device `LED-01` appears; ONLINE/OFFLINE follows the physical device. Simulation mode stays ON: never change firmware `RELAY_SIMULATION_MODE`, never disable relay channels.
- [ ] A relay command from the UI is acknowledged and its result shown (success and timeout paths), per FRS 7.2.
- [ ] A user without the permission cannot send commands; permissions gate the navigation.
- [ ] History pages show telemetry in `Asia/Kolkata` time.
- [ ] The existing Humidifier still reports on `cimcms/humidifier/<id>/status` and is undisturbed (its `mqttuser` login is a LEGACY account, `broker.md`).
- [ ] After `docker compose restart` of the whole stack everything returns without manual steps.
- [ ] `docker compose ps` shows `broker` healthy; `infra/dev/check-mqtt.ps1 -Url mqtts://<broker-host>:8883 -DeviceId LED-01` prints CONNECTED.
- [ ] A backup file exists and `pg_restore --list` reads it (`backup-restore.md` section 2).
- [ ] `docker compose ps`: only `web` publishes ports (80, 443); `ss -ltn` on the host shows no 5432 or 3814.

Record the completed run in `docs/PROGRESS.md`. A full dry run on a staging VM is recommended before the first real install.
