#!/usr/bin/env bash
# SUPERSEDED (D26, 2026-11-24): the server now runs the own CIMCMS broker (infra/server-broker,
# docs/runbooks/broker.md). Kept only for rollback to Mosquitto; do not use for new setups.
# CIMCMS: one-time setup on the server AFTER uploading docker-compose.yml, config/mosquitto.conf
# and config/acl from infra/server-mosquitto/. Run as root in the broker folder:
#
#   bash setup-accounts.sh            # creates admin + API accounts, restarts the broker, verifies
#   MQTTUSER_PASSWORD='...' bash setup-accounts.sh   # also proves mqttuser (Humidifier) still works
#
# It never touches your password file. If a check fails it restores the backup it made and
# restarts the broker with the old files.
set -euo pipefail

DIR="$(pwd)"
CONTAINER="${CONTAINER:-mosquitto}"
ADMIN_USER=cimcms-admin
BACKEND_USER=cimcms-backend
DYNSEC_FILE=/mosquitto/data/dynamic-security.json
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$DIR/backup-before-cimcms-$TS"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
step() { printf '\n\033[36m== %s\033[0m\n' "$*"; }
die() { red "STOP: $*"; exit 1; }
newpw() { local p; p="$(head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"; printf '%s' "${p:0:32}"; }

step "Checks"
[ -f docker-compose.yml ] || die "run this in the broker folder (docker-compose.yml not found)"
[ -f config/mosquitto.conf ] && [ -f config/acl ] || die "upload config/mosquitto.conf and config/acl first"
grep -q 'mosquitto_dynamic_security' config/mosquitto.conf || die "config/mosquitto.conf is not the CIMCMS version"
PWFILE="$(grep -E '^[[:space:]]*password_file' config/mosquitto.conf | awk '{print $2}' | tail -1)"
[ -f "config/$(basename "$PWFILE")" ] || die "password file config/$(basename "$PWFILE") not found: set password_file in mosquitto.conf to your existing file name"
USERS="$(cut -d: -f1 "config/$(basename "$PWFILE")" | tr '\n' ' ')"
echo "password file users: $USERS"
for u in $USERS; do
  grep -Eq "^[[:space:]]*user[[:space:]]+$u[[:space:]]*$" config/acl || die "user '$u' is missing in config/acl: add a block for it or it loses access"
done
green "config looks right"

step "Backup -> $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp -a config "$BACKUP_DIR/"
[ -f docker-compose.yml ] && cp -a docker-compose.yml "$BACKUP_DIR/"
[ -f data/dynamic-security.json ] && cp -a data/dynamic-security.json "$BACKUP_DIR/"
green "backup done (note: the uploaded files are already in place; the old ones are in your own copy)"

ADMIN_PW=""; BACKEND_PW=""
restore() {
  trap - EXIT
  red "A check failed. Your old files: restore them from your own copy, then: docker compose up -d"
  red "Broker logs: docker logs --tail 50 $CONTAINER"
  exit 1
}
trap restore EXIT

step "1. Broker admin '$ADMIN_USER'"
if [ -f data/dynamic-security.json ]; then
  echo "data/dynamic-security.json exists: keeping it (admin already created earlier)."
  read -r -s -p "Password of $ADMIN_USER: " ADMIN_PW; echo
else
  ADMIN_PW="$(newpw)"
  docker compose run --rm --no-deps -e P="$ADMIN_PW" mosquitto sh -c \
    "mosquitto_ctrl dynsec init $DYNSEC_FILE $ADMIN_USER \"\$P\" >/dev/null && chown mosquitto:mosquitto $DYNSEC_FILE"
  green "admin created"
fi

step "2. Start the broker with the new config"
docker compose up -d
# mosquitto_ctrl exits 0 even when it prints an error: treat "Error"/"error" in the output as failure.
# $1 is expanded here; write "$B" (single-quoted at the call) to pass the API password inside.
ctrl() { docker exec -e P="$ADMIN_PW" -e B="${BACKEND_PW:-}" "$CONTAINER" sh -c "out=\$(mosquitto_ctrl -u $ADMIN_USER -P \"\$P\" dynsec $1 2>&1); rc=\$?; case \"\$out\" in *Error*|*error*) rc=1;; esac; printf '%s\n' \"\$out\" | grep -v -e 'without encryption' -e 'visible on the network' -e '^\$' >&2; exit \$rc"; }
for _ in $(seq 1 30); do ctrl getDefaultACLAccess >/dev/null 2>&1 && break; sleep 1; done
ctrl getDefaultACLAccess >/dev/null 2>&1 || die "broker not up or admin login failed: docker logs --tail 50 $CONTAINER"
green "broker up, admin login works"

step "3. API account '$BACKEND_USER' (only the topics the API needs)"
if ctrl "getClient $BACKEND_USER" >/dev/null 2>&1; then
  echo "account exists: setting a new password"
  BACKEND_PW="$(newpw)"
  ctrl "setClientPassword $BACKEND_USER "'"$B"' >/dev/null
else
  ctrl "createRole $BACKEND_USER" >/dev/null
  for t in status telemetry ack event; do
    ctrl "addRoleACL $BACKEND_USER subscribeLiteral cimcms/led/+/$t allow" >/dev/null
    ctrl "addRoleACL $BACKEND_USER publishClientReceive cimcms/led/+/$t allow" >/dev/null
  done
  ctrl "addRoleACL $BACKEND_USER subscribeLiteral cimcms/humidifier/+/status allow" >/dev/null
  ctrl "addRoleACL $BACKEND_USER publishClientReceive cimcms/humidifier/+/status allow" >/dev/null
  for t in command config; do ctrl "addRoleACL $BACKEND_USER publishClientSend cimcms/led/+/$t allow" >/dev/null; done
  ctrl "addRoleACL $BACKEND_USER publishClientSend cimcms/backend/status allow" >/dev/null
  ctrl "addRoleACL $BACKEND_USER subscribeLiteral cimcms/backend/status allow" >/dev/null
  ctrl "addRoleACL $BACKEND_USER publishClientReceive cimcms/backend/status allow" >/dev/null
  BACKEND_PW="$(newpw)"
  ctrl "createClient $BACKEND_USER -p "'"$B"' >/dev/null
  ctrl "addClientRole $BACKEND_USER $BACKEND_USER" >/dev/null
fi
green "account ready"

step "4. Verify"
docker exec -e B="$BACKEND_PW" "$CONTAINER" sh -c "
  (mosquitto_sub -u $BACKEND_USER -P \"\$B\" -i cimcms-setup-sub -t cimcms/backend/status -C 1 -W 5 > /tmp/setup-check.txt) &
  sleep 1
  mosquitto_pub -u $BACKEND_USER -P \"\$B\" -i cimcms-setup-pub -t cimcms/backend/status -m '{\"state\":\"offline\"}' -r -q 1
  sleep 2; grep -q offline /tmp/setup-check.txt" || die "API account check failed"
green "API account: login + topics OK"
if docker exec "$CONTAINER" mosquitto_pub -u "$BACKEND_USER" -P wrong-password -t cimcms/backend/status -m x >/dev/null 2>&1; then die "a wrong password was accepted"; fi
green "wrong password refused"
if [ -n "${MQTTUSER_PASSWORD:-}" ]; then
  docker exec -e M="$MQTTUSER_PASSWORD" "$CONTAINER" sh -c "
    (mosquitto_sub -u mqttuser -P \"\$M\" -i cimcms-setup-mq -t test/cimcms-setup -C 1 -W 5 > /tmp/setup-mq.txt) &
    sleep 1
    mosquitto_pub -u mqttuser -P \"\$M\" -t test/cimcms-setup -m ok
    sleep 2; grep -q ok /tmp/setup-mq.txt" || die "mqttuser check failed (Humidifier would be affected)"
  green "mqttuser still works (pub + sub)"
else
  echo "mqttuser not tested. Run again with MQTTUSER_PASSWORD='...' or test by hand (see README)."
fi

trap - EXIT
OUT="$DIR/cimcms-mqtt-credentials-$TS.txt"
umask 077
{
  echo "# CIMCMS broker accounts ($TS). Put these into apps/api/.env, keep them in a password manager, then DELETE this file."
  echo "MQTT_USERNAME=$BACKEND_USER"
  echo "MQTT_PASSWORD=$BACKEND_PW"
  echo "MQTT_PROVISIONING=dynsec"
  echo "MQTT_ADMIN_USERNAME=$ADMIN_USER"
  echo "MQTT_ADMIN_PASSWORD=$ADMIN_PW"
} > "$OUT"
step "Done"
echo "Values for apps/api/.env (also in $OUT, root-only):"
grep -v '^#' "$OUT"
red "Port 1883 is plain MQTT: these passwords travel unencrypted. Add the TLS listener next."
