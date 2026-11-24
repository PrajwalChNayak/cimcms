> **Superseded (D26, 2026-11-24).** Development now uses the own CIMCMS broker instead of this
> Mosquitto container: `npm run dev:broker` (apps/broker, port 1883, health on 8081). It reads logins
> from table `MqttAccount` in the dev database (`DATABASE_URL` in `apps/broker/.env`, same as
> `apps/api/.env`; apply migrations first with `npm run db:deploy -w apps/api`). Stop this container
> first (`docker compose -f infra/dev/docker-compose.yml stop mosquitto`), both use port 1883.
>
> Create the dev logins once (passwords from the git-ignored `infra/dev/.dev-credentials.local`,
> never typed into a committed file):
>
> ```
> # API login: then set MQTT_PASSWORD in apps/api/.env to the printed (or given) password
> MQTT_ACCOUNT_PASSWORD=<MQTT_BACKEND_PASSWORD> npm run mqtt:account -w apps/api -- --username cimcms-backend --kind service
> # LED-01 simulator (infra/dev/run-sim.ps1): add LED-01 in the web app (Devices -> Add device, creates
> # the device login and shows its password once; put it in MQTT_LED01_PASSWORD), or reset its
> # password on the device page.
> ```
>
> With the own broker set `MQTT_PROVISIONING=broker` (default) in `apps/api/.env`; `MQTT_ADMIN_*`
> and the Dynamic Security section below no longer apply. Runbook: `docs/runbooks/broker.md`.
> The rest of this file is kept for anyone still running the Mosquitto container.

# Dev Mosquitto

The `passwd` file is git-ignored. Create an empty file first (`touch infra/dev/mosquitto/passwd`; it is bind-mounted, so `-c` cannot be used), then add users with random dev passwords (do not commit or paste them):

```
docker compose -f infra/dev/docker-compose.yml run --rm --no-deps mosquitto mosquitto_passwd -b /mosquitto/config/passwd cimcms-backend <dev-pass>
docker compose -f infra/dev/docker-compose.yml run --rm --no-deps mosquitto mosquitto_passwd -b /mosquitto/config/passwd LED-01 <dev-pass>
```

Start everything: `npm run dev:infra`.

Dev `DATABASE_URL`: `postgresql://cimcms:cimcms_dev_only@localhost:5433/cimcms?schema=public`

Check ACLs:
```
docker compose -f infra/dev/docker-compose.yml exec mosquitto mosquitto_sub -h localhost -u cimcms-backend -P <pass> -t 'cimcms/led/+/telemetry' -C 1 -W 3
docker compose -f infra/dev/docker-compose.yml exec mosquitto mosquitto_pub -h localhost -u LED-01 -P <pass> -t cimcms/led/LED-02/telemetry -m x -d   # must not be delivered (PUBACK shows no error for QoS0; use a subscriber to confirm)
```

On Git Bash for Windows, put `MSYS_NO_PATHCONV=1` in front of every docker command in this file. Without it, Git Bash rewrites container paths such as `/mosquitto/data/...` into Windows paths and the command fails.

## Dynamic Security plugin (automatic device accounts)

### What it is for

The dev broker loads Mosquitto's Dynamic Security plugin. `mosquitto.conf` contains:

```
plugin /usr/lib/mosquitto_dynamic_security.so
plugin_opt_config_file /mosquitto/data/dynamic-security.json
```

The plugin keeps its own list of users and roles in that JSON file, and an admin account can change them by sending MQTT messages. The API uses this to create a broker account automatically when an admin adds a device in the web app (Devices → Add device), as long as `MQTT_PROVISIONING=dynsec` is set in `apps/api/.env`. Each device gets user name = client ID = device ID, its own role `cimcms-device-<deviceId>` that only allows that device's own topics, and a random password that the web app shows once. The device page has a Broker account card with Reset password, and deleting a device deletes its broker account.

The `passwd` and `acl` files are still loaded. Users in those files (`cimcms-backend`, `LED-01`) keep working next to the plugin, because the plugin passes clients it does not know on to the files. This was verified with eclipse-mosquitto 2.1.2.

The JSON file lives in the `mosquitto-dev-data` Docker volume, not in Git. `docker compose down -v` deletes the volume, and with it the admin account and every automatic device account.

### First-time setup (fresh volume only)

Do this once per volume: on a new machine, or after the volume was deleted. The admin user is `cimcms-admin`. Its password is in the git-ignored `infra/dev/.dev-credentials.local` as `MQTT_ADMIN_USER` / `MQTT_ADMIN_PASSWORD`. On a new machine, generate a new random password and add both lines to that file first. Do not commit or paste it.

```
docker compose -f infra/dev/docker-compose.yml run --rm --no-deps mosquitto sh -c 'mosquitto_ctrl dynsec init /mosquitto/data/dynamic-security.json cimcms-admin <admin-password> && chown mosquitto:mosquitto /mosquitto/data/dynamic-security.json'
docker compose -f infra/dev/docker-compose.yml restart mosquitto
```

The first command creates the JSON file with the admin account and gives it to the `mosquitto` user (the one-off container runs as root, and the broker must be able to write the file). The restart is needed because the plugin reads the file only when the broker starts.

### Turn it on in the API

Set these in `apps/api/.env` (see `apps/api/.env.example`):

```
MQTT_PROVISIONING=dynsec
MQTT_ADMIN_USERNAME=cimcms-admin
MQTT_ADMIN_PASSWORD=<admin-password>
MQTT_DEVICE_URL=mqtt://<your-PC-LAN-IP>:1883
```

Then apply the database migrations once (`npm run db:deploy -w apps/api`; it adds the `DeviceMqttAccount` table) and restart the API.

- The admin connection uses `MQTT_URL`. Plain `mqtt://localhost:1883` is fine on your own machine. In production it must be TLS (see `docs/runbooks/mosquitto-hardening.md` step 13), because device passwords travel inside the admin messages.
- `MQTT_DEVICE_URL` is the broker address the web app shows to whoever sets up a device. Use your PC's LAN IP so a real device on the same network can reach the broker. The dev compose file publishes port 1883 on all interfaces; Windows Firewall may need a rule that allows inbound TCP 1883.
- With `MQTT_PROVISIONING=manual` (the default) the API does not use the plugin at all. Create device accounts with `mosquitto_passwd` as described at the top of this file; the web app shows these manual steps.

### Inspect accounts

```
docker compose -f infra/dev/docker-compose.yml exec mosquitto mosquitto_ctrl -h localhost -u cimcms-admin -P <admin-password> dynsec listClients
docker compose -f infra/dev/docker-compose.yml exec mosquitto mosquitto_ctrl -h localhost -u cimcms-admin -P <admin-password> dynsec getClient <deviceId>
docker compose -f infra/dev/docker-compose.yml exec mosquitto mosquitto_ctrl -h localhost -u cimcms-admin -P <admin-password> dynsec getRole cimcms-device-<deviceId>
```

`listClients` shows `cimcms-admin` plus one entry per device created by the API. Users from the `passwd` file are not listed there.

To try a device account by hand (the client ID must equal the device ID, so pass `-i`):

```
docker compose -f infra/dev/docker-compose.yml exec mosquitto mosquitto_pub -h localhost -i <deviceId> -u <deviceId> -P <device-password> -t cimcms/led/<deviceId>/status -m x -d
```

### Troubleshooting

- **The broker does not start, or its log says it cannot open or save `dynamic-security.json`.** The file must be owned by the `mosquitto` user. Fix it and restart:
  ```
  docker compose -f infra/dev/docker-compose.yml run --rm --no-deps mosquitto chown mosquitto:mosquitto /mosquitto/data/dynamic-security.json
  docker compose -f infra/dev/docker-compose.yml restart mosquitto
  ```
  Read the log with `docker compose -f infra/dev/docker-compose.yml logs --tail 50 mosquitto`.
- **Init worked, but the admin login is refused.** Restart the broker after init; the plugin reads the file only at startup. Also check the password against `.dev-credentials.local`.
- **The API says the broker admin account is not configured.** `MQTT_ADMIN_USERNAME` or `MQTT_ADMIN_PASSWORD` is missing from `apps/api/.env`, or the API was not restarted after editing it.
- **The API cannot log in as the admin after the volume was recreated.** The new volume has no `dynamic-security.json`: run the first-time setup again. All automatic device accounts were lost with the old volume. Use Reset password on each affected device in the web app (it re-creates a missing account) and load the new password onto the device.
- **A device is refused although its password is right.** It must connect with client ID equal to its device ID.
- **A user exists both in `passwd` and in the plugin.** The plugin answers first for users it knows, so the `passwd` entry is ignored. Keep each device in one place only.
