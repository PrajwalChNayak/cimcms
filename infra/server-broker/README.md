# CIMCMS broker on the server (replaces Mosquitto)

Runs the CIMCMS MQTT broker (`apps/broker`, aedes) on the server `148.135.137.198` in place of the
Mosquitto container. Logins come from the CIMCMS database (table `MqttAccount`, kinds DEVICE /
SERVICE / LEGACY), retained messages are stored in `MqttRetained`. Operations: `docs/runbooks/broker.md`.

HUMAN-ONLY: a person runs these steps on the server. No automated agent may SSH to the server.

Files:

- `docker-compose.yml`: builds the image from the repository (`context: ../..`), publishes 1883
  (8883 prepared, commented), health check on `GET /health` (port 8081, not published),
  `restart: unless-stopped`, log rotation (10 MB x 5).
- `.env.example`: copy to `/opt/cimcms/secrets/broker.env` (outside git, `chmod 600`). Only `DATABASE_URL` is needed.

## Database

The broker must reach the CIMCMS database (today the Postgres on this server, database `bms_test`).
Inside the container `localhost` is the container itself, so use `host.docker.internal:<port>`
(mapped to the host by `extra_hosts` in the compose file) when Postgres publishes a port on the
host, or put the broker on the Postgres container's Docker network and use its service name.
Check from the server before switching:

```
docker compose run --rm --no-deps broker node -e "const {PrismaClient}=require('@prisma/client');new PrismaClient().mqttAccount.count().then(n=>{console.log('accounts',n);process.exit(0)},e=>{console.error(e.message);process.exit(1)})"
```

The database must already have the broker tables: the API applies migrations at start
(`prisma migrate deploy`), so update and start the API first. The broker never runs migrations.

## Switch-over from Mosquitto

The Mosquitto container runs from a folder with `docker-compose.yml`, `./config`, `./data`, `./log`
(below: `<mosquitto-dir>`). Ports stay the same, so clients need no change.

1. **Back up the Mosquitto folder** (keeps the password file, ACL, dynamic-security.json):
   ```
   cd <mosquitto-dir>
   tar czf ~/mosquitto-backup-$(date +%Y%m%d-%H%M%S).tgz config data log docker-compose.yml
   ```
2. **Create the accounts first** (while Mosquitto still runs; this only writes to the database).
   In the API container (or with `npm run mqtt:account -w apps/api -- ...` from a checkout with
   `DATABASE_URL` set):
   ```
   # API login (kind service). Prints a new random password once: put it in the API's MQTT_PASSWORD.
   docker compose exec api node dist/src/models/mqtt-account.js --username cimcms-backend --kind service

   # Humidifier login (kind legacy) with the SAME password the Humidifier already uses, so the
   # firmware needs no change. Take it from the password manager; it never goes into a file.
   docker compose exec -e MQTT_ACCOUNT_PASSWORD='<humidifier password>' api node dist/src/models/mqtt-account.js --username mqttuser --kind legacy
   ```
   Device logins (kind device) are created by the API on "Add device" (`MQTT_PROVISIONING=broker`).
   Devices that already had a Mosquitto login (for example `LED-01`) need a new device login:
   reset the password on the device page and enter it on the device. Point the API at the broker
   (`MQTT_URL=mqtt://<server>:1883`, `MQTT_USERNAME=cimcms-backend`, `MQTT_PASSWORD=<new>`,
   `MQTT_PROVISIONING=broker`, no `MQTT_ADMIN_*`) and restart it after step 4.
3. **Prepare the broker** (does not start it yet):
   ```
   cd <repo>/infra/server-broker
   sudo install -m 600 .env.example /opt/cimcms/secrets/broker.env   # then edit DATABASE_URL
   docker compose build
   ```
4. **Stop Mosquitto, start the broker** (clients reconnect within seconds):
   ```
   cd <mosquitto-dir> && docker compose down
   cd <repo>/infra/server-broker && docker compose up -d
   docker compose ps          # STATUS must become "healthy"
   docker compose logs -f     # JSON lines: "client connected", "auth failed" ...
   ```
5. **Verify**:
   - From a PC: `powershell -NoProfile -ExecutionPolicy Bypass -File infra\dev\check-mqtt.ps1 -Url mqtt://148.135.137.198:1883 -DeviceId <deviceId>` prints CONNECTED.
   - The Humidifier reconnects: `docker compose logs broker | grep mqttuser` shows a connect,
     and the CIMCMS dashboard (or `mosquitto_sub` from a PC with the `mqttuser` login) shows
     fresh messages on `cimcms/humidifier/<id>/status`.
   - The API log shows the MQTT connection and device status updates arrive.

## Rollback

Nothing in the Mosquitto folder was changed, so going back is two commands:

```
cd <repo>/infra/server-broker && docker compose down
cd <mosquitto-dir> && docker compose up -d
```

Put the API's old MQTT settings back if they were changed. The accounts in `MqttAccount` stay
in the database and do no harm. If the Mosquitto folder was damaged, restore it from the
backup of step 1 first.

## TLS (8883)

Uncomment `8883:8883`, the `BROKER_TLS_*` variables and the certificate volume in
`docker-compose.yml`, then `docker compose up -d`. The broker starts the TLS listener only when both
certificate and key are set. See `docs/runbooks/broker.md`.
