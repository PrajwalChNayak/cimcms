# Runbook: CIMCMS MQTT broker (HUMAN-ONLY on servers)

The own broker `apps/broker` (`@cimcms/broker`, aedes) replaces Mosquitto (PROGRESS D26). It
reads logins from the CIMCMS PostgreSQL database and keeps retained messages there, so there are
no broker config, password or ACL files. No automated agent may SSH to a server or run these steps
against a live broker.

Related: `infra/server-broker/` (current server, switch-over and rollback), `infra/prod/docker-compose.yml`
(service `broker`), `apps/broker/Dockerfile`, `apps/broker/.env.example`, `docs/runbooks/deploy.md`.
Superseded: `docs/runbooks/mosquitto-hardening.md`, `infra/server-mosquitto/`, `infra/prod/scripts/harden-mosquitto.sh`.

## How it works

- Table `MqttAccount`: one row per login, `passwordHash` is argon2id (the password itself is never
  stored), `enabled` switches a login off. Kinds:
  - `SERVICE`: the CIMCMS API (`cimcms-backend`). Publishes commands/config, subscribes to device status/telemetry/ack/event.
  - `DEVICE`: one device (`username` = client ID = device ID). Only its own topics
    (`cimcms/<type>/<deviceId>/status|telemetry|ack|event` publish, `command|config` subscribe).
  - `LEGACY`: old clients such as the Humidifier (`mqttuser`); keeps the topics they used under Mosquitto.
- Table `MqttRetained`: retained messages (status, LWT, device config), restored at start.
- The broker never runs migrations. The API applies them at start (`prisma migrate deploy`);
  start/update the API first after a schema change.
- When the API changes or deletes a login it publishes to `cimcms/broker/account-changed` and
  the broker drops that login's open sessions.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | (required) | Same database as the API |
| `BROKER_PORT` | 1883 | Plain MQTT |
| `BROKER_TLS_PORT` | 8883 | MQTTS, only started when cert and key are set |
| `BROKER_TLS_CERT` / `BROKER_TLS_KEY` | empty | PEM files (for example Let's Encrypt `fullchain.pem` / `privkey.pem`) |
| `BROKER_HEALTH_PORT` | 8081 | `GET /health` |
| `BROKER_LOG` | empty | `silent` turns logging off |

Local development: `cp apps/broker/.env.example apps/broker/.env` (same `DATABASE_URL` as
`apps/api/.env`), then `npm run dev:broker`.

## Accounts (CLI)

Run from a checkout with `DATABASE_URL` set (`npm run mqtt:account -w apps/api -- ...`) or inside
the API container (`node dist/src/models/mqtt-account.js ...`):

```
# API login. Prints a new random password once: store it in the password manager and in the
# API's MQTT_PASSWORD (api.env), then restart the API.
docker compose exec api node dist/src/models/mqtt-account.js --username cimcms-backend --kind service

# Legacy client with a password you choose (here: the Humidifier keeps its existing password).
# The password comes from an environment variable, never from the command line or a file.
docker compose exec -e MQTT_ACCOUNT_PASSWORD='<humidifier password>' api node dist/src/models/mqtt-account.js --username mqttuser --kind legacy
```

Running the command again for an existing user name sets a new password. Device logins are not
made with the CLI: the API creates them on Devices -> Add device (`MQTT_PROVISIONING=broker`, the
default), shows the password once, and offers Reset password and delete on the device page.
Use `MQTT_PROVISIONING=manual` only with an external broker.

List logins (read-only):

```
docker compose exec postgres psql -U <postgres-user> -d <db> -c 'SELECT username, kind, "deviceId", enabled, "passwordSetAt" FROM "MqttAccount" ORDER BY kind, username'
```

Block a login at once without deleting it: `UPDATE "MqttAccount" SET enabled = false WHERE username = '<name>'`
(new connections are refused; restart the broker or reset the login in the web app to also drop an open session).

## Logs

One JSON line per event on stdout/stderr (`docker compose logs -f broker`), rotated by Docker
(10 MB x 5). Logged: start, listeners, client connected/disconnected, failed logins (user name only),
denied publish/subscribe, database errors. Passwords and message payloads are never logged.

## Health

`GET /health` on `BROKER_HEALTH_PORT` returns `{"status":"ok","database":"up","clients":<n>}`
(HTTP 200) or 503 when the database is not reachable. The compose healthcheck calls it inside the
container (`curl -fsS http://localhost:8081/health`); the port is not published. Check by hand:
`docker compose exec broker curl -fsS http://localhost:8081/health`. From a PC, check a device login with
`infra/dev/check-mqtt.ps1 -Url mqtt://<host>:1883 -DeviceId <deviceId>`.

## TLS (8883)

1. Certificate for the MQTT host name (for example `mqtt.<domain>`), for example with certbot.
2. The broker runs as uid 1000 (`node`). Let the key be readable for it, for example
   `chgrp 1000 /etc/letsencrypt/{live,archive}` plus `chmod g+rx` on those folders and `chmod g+r`
   on `archive/<host>/privkey*.pem`, or copy cert and key into a folder owned by uid 1000 from a certbot deploy hook.
3. Mount the folder read-only and set `BROKER_TLS_CERT` / `BROKER_TLS_KEY` (already done for
   `infra/prod`; commented in `infra/server-broker/docker-compose.yml`), publish 8883, open 8883 in the firewall.
4. After a certificate renewal restart the broker (`docker compose restart broker`; clients reconnect).
5. Devices then use `mqtts://<mqtt-host>:8883`; set `MQTT_DEVICE_URL` in the API to that address.

## Backup and restore

Nothing to back up on the broker itself: logins (`MqttAccount`) and retained messages
(`MqttRetained`) are in the CIMCMS database, so the normal database backup (`docs/runbooks/backup-restore.md`)
covers them. After a database restore, restart the broker so it reloads retained messages.

## Update

Build/pull the new `cimcms-broker` image, update and start the API first (migrations), then
`docker compose up -d broker`. Clients reconnect within seconds.

## Rollback to Mosquitto

On the current server see `infra/server-broker/README.md` ("Rollback"): stop the broker, start
the Mosquitto container again in its old folder (it was not changed), and put the API's old
MQTT settings back. Device logins created in CIMCMS after the switch do not exist in Mosquitto.
