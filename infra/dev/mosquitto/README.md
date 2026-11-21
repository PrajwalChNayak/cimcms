# Dev Mosquitto

The `passwd` file is git-ignored. Create an empty file first (`touch infra/dev/mosquitto/passwd`; it is bind-mounted, so `-c` cannot be used), then add users with random dev passwords (do not commit or paste them):

```
docker compose -f infra/dev/docker-compose.yml run --rm --no-deps mosquitto mosquitto_passwd -b /mosquitto/config/passwd cimcms-backend <dev-pass>
docker compose -f infra/dev/docker-compose.yml run --rm --no-deps mosquitto mosquitto_passwd -b /mosquitto/config/passwd LED-01 <dev-pass>
```

Start everything: `npm run dev:infra`.

Dev `DATABASE_URL`: `mongodb://localhost:27017/cimcms?replicaSet=rs0&directConnection=true`

Check ACLs:
```
docker compose -f infra/dev/docker-compose.yml exec mosquitto mosquitto_sub -h localhost -u cimcms-backend -P <pass> -t 'cimcms/led/+/telemetry' -C 1 -W 3
docker compose -f infra/dev/docker-compose.yml exec mosquitto mosquitto_pub -h localhost -u LED-01 -P <pass> -t cimcms/led/LED-02/telemetry -m x -d   # must not be delivered (PUBACK shows no error for QoS0; use a subscriber to confirm)
```
