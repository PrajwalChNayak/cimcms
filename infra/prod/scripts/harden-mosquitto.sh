#!/usr/bin/env bash
# SUPERSEDED (D26, 2026-11-24): the server now runs the own CIMCMS broker (infra/server-broker,
# docs/runbooks/broker.md). Kept only for rollback to Mosquitto; do not use for new setups.
# CIMCMS: harden the existing Mosquitto broker on the server and enable automatic device
# accounts (Dynamic Security plugin). HUMAN-ONLY: a person runs this on the server.
# Runbook: docs/runbooks/mosquitto-hardening.md (step 13).
#
# Run as root (or a docker user) in the folder that holds the broker's docker-compose.yml
# with config/, data/ and log/ (the layout `./config:/mosquitto/config`, `./data:/mosquitto/data`):
#
#   ./harden-mosquitto.sh                  # dry run: checks only, changes nothing
#   ./harden-mosquitto.sh --apply          # back up, enable the plugin, create accounts, verify
#   ./harden-mosquitto.sh --rollback <backup.tgz>   # put the old config back and restart
#
# What --apply does (stops and rolls back by itself if a check fails):
#   1. Backs up config/ and data/ to backup-mosquitto-<time>.tgz.
#   2. Adds the Dynamic Security plugin to mosquitto.conf. password_file / acl_file stay, so
#      existing users (mqttuser, used by the Humidifier) keep working exactly as before.
#   3. Creates the broker admin `cimcms-admin` (for the API to create device accounts) and
#      the API's own account `cimcms-backend` with only the topics the API needs.
#   4. Restarts the broker (devices reconnect within seconds) and verifies logins and topics.
#   5. Prints the values for the API's .env once and saves them to a root-only file.
#
# Env overrides: CONTAINER (default mosquitto), DIR (default: current folder),
#   MQTTUSER_PASSWORD (optional: also proves that `mqttuser` still works after the change).
set -euo pipefail

CONTAINER="${CONTAINER:-mosquitto}"
DIR="${DIR:-$(pwd)}"
CONF="$DIR/config/mosquitto.conf"
PLUGIN=/usr/lib/mosquitto_dynamic_security.so
DYNSEC_FILE=/mosquitto/data/dynamic-security.json
ADMIN_USER=cimcms-admin
BACKEND_USER=cimcms-backend
TS="$(date +%Y%m%d-%H%M%S)"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
step() { printf '\n\033[36m== %s\033[0m\n' "$*"; }
die() { red "STOP: $*"; exit 1; }
dx() { docker exec "$@"; }

usage() { sed -n '2,25p' "$0"; exit 2; }

# ------------------------------------------------------------------ rollback
if [ "${1:-}" = "--rollback" ]; then
  BK="${2:-}"; [ -f "$BK" ] || die "usage: $0 --rollback <backup-mosquitto-*.tgz>"
  step "Rollback from $BK"
  tmp="$(mktemp -d)"; tar xzf "$BK" -C "$tmp" config
  cp -a "$CONF" "$CONF.before-rollback-$TS"
  cp -a "$tmp/config/." "$DIR/config/"
  rm -rf "$tmp"
  docker restart "$CONTAINER" >/dev/null
  sleep 3
  docker ps --filter "name=^${CONTAINER}$" --format '{{.Status}}' | grep -q '^Up' || die "broker did not start after rollback: docker logs $CONTAINER"
  green "Old config restored and broker restarted. (The plugin's state file in data/ is left in place; it is unused.)"
  exit 0
fi

APPLY=0
case "${1:-}" in
  --apply) APPLY=1 ;;
  "") ;;
  -h|--help) usage ;;
  *) usage ;;
esac

# ------------------------------------------------------------------ checks
step "Checks"
command -v docker >/dev/null || die "docker not found"
docker ps --filter "name=^${CONTAINER}$" --format '{{.Status}}' | grep -q '^Up' || die "container '$CONTAINER' is not running (set CONTAINER=...)"
[ -f "$CONF" ] || die "$CONF not found (run in the folder with config/ and data/, or set DIR=...)"
[ -d "$DIR/data" ] || die "$DIR/data not found"
VERSION="$(dx "$CONTAINER" mosquitto -h 2>&1 | grep -Eo 'version [0-9.]+' | head -1 || true)"
echo "Broker: mosquitto ${VERSION:-unknown}"
echo "$VERSION" | grep -Eq 'version 2\.' || die "Mosquitto 2.x is needed for the Dynamic Security plugin"
dx "$CONTAINER" test -f "$PLUGIN" || die "plugin $PLUGIN not found in the container"
dx "$CONTAINER" sh -c 'command -v mosquitto_ctrl >/dev/null' || die "mosquitto_ctrl not found in the container"

conf_value() { grep -E "^[[:space:]]*$1[[:space:]]+" "$CONF" | tail -1 | awk '{print $2}'; }
PASSWORD_FILE="$(conf_value password_file || true)"
ACL_FILE="$(conf_value acl_file || true)"
ANON="$(conf_value allow_anonymous || true)"
PORT="$(grep -E '^[[:space:]]*listener[[:space:]]+[0-9]+' "$CONF" | head -1 | awk '{print $2}')"
PORT="${PORT:-1883}"
echo "listener: ${PORT}   password_file: ${PASSWORD_FILE:-<none>}   acl_file: ${ACL_FILE:-<none>}   allow_anonymous: ${ANON:-<default>}"
grep -Eq '^[[:space:]]*per_listener_settings[[:space:]]+true' "$CONF" && die "per_listener_settings true is set: this script expects shared settings; follow the runbook by hand"
[ -n "$PASSWORD_FILE" ] || die "no password_file in mosquitto.conf: existing logins would not survive; follow the runbook by hand"
[ "$ANON" = "true" ] && die "allow_anonymous true: fix that first (anonymous clients would bypass the new accounts)"

ALREADY=0
if grep -Eq "^[[:space:]]*plugin[[:space:]]+$PLUGIN" "$CONF"; then
  ALREADY=1; echo "Dynamic Security plugin is already in mosquitto.conf."
fi
USERS="$(dx "$CONTAINER" sh -c "cut -d: -f1 '$PASSWORD_FILE'" 2>/dev/null | tr '\n' ' ' || true)"
echo "Existing password_file users (they keep working): ${USERS:-<could not read>}"

if [ "$APPLY" != "1" ]; then
  green "Dry run OK. Nothing was changed. Run again with --apply during a quiet moment (the broker restarts once)."
  exit 0
fi

# ------------------------------------------------------------------ apply
# Finite input (no SIGPIPE under pipefail): 64 random bytes -> base64 -> letters/digits -> 32 chars.
newpw() { local p; p="$(head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"; printf '%s' "${p:0:32}"; }
ADMIN_PW="$(newpw)"; BACKEND_PW="$(newpw)"
BACKUP="$DIR/backup-mosquitto-$TS.tgz"

step "1. Backup -> $BACKUP"
# GNU tar exits 1 when a file changed while it was read (the live broker DB): still a usable backup.
tar czf "$BACKUP" -C "$DIR" config data || { rc=$?; [ "$rc" -eq 1 ] || die "backup failed (tar exit $rc)"; }
chmod 600 "$BACKUP"
green "backup written"
# From here on, any unexpected stop puts the old config back.
BACKUP_TAKEN=1
DONE=0
trap 'if [ "${DONE:-0}" != 1 ] && [ -n "${BACKUP_TAKEN:-}" ]; then rollback_now; fi' EXIT

rollback_now() {
  trap - EXIT
  red "A check failed: restoring the old config."
  tmp="$(mktemp -d)"; tar xzf "$BACKUP" -C "$tmp" config
  cp -a "$tmp/config/." "$DIR/config/"; rm -rf "$tmp"
  docker restart "$CONTAINER" >/dev/null || true
  red "Rolled back to $BACKUP. Broker restarted with the old config."
  exit 1
}

wait_up() {
  for _ in $(seq 1 30); do
    if dx "$CONTAINER" sh -c "mosquitto_ctrl -p $PORT -u $ADMIN_USER -P \"\$1\" dynsec getDefaultACLAccess >/dev/null 2>&1" _ "$ADMIN_PW"; then return 0; fi
    sleep 1
  done
  return 1
}

if [ "$ALREADY" = "0" ]; then
  step "2. Enable the Dynamic Security plugin"
  if dx "$CONTAINER" test -f "$DYNSEC_FILE"; then
    die "$DYNSEC_FILE already exists but the plugin is not configured; inspect it by hand"
  fi
  # Tested: with the plugin loaded and NO acl_file, users from password_file lose their
  # subscribe rights (the Humidifier's mqttuser would break). So when there is no acl_file,
  # write one that keeps exactly today's access for those users: everything.
  if [ -z "$ACL_FILE" ]; then
    ACL_FILE=/mosquitto/config/acl
    dx "$CONTAINER" test ! -e "$ACL_FILE" || die "$ACL_FILE exists but is not configured; inspect it by hand"
    {
      echo "# CIMCMS $TS: keeps the access password_file users had before the Dynamic Security"
      echo "# plugin was added (full access). Narrow this later, user by user."
      for u in $USERS; do printf 'user %s\ntopic readwrite #\n\n' "$u"; done
    } | dx -i "$CONTAINER" sh -c "cat > '$ACL_FILE' && chown mosquitto:mosquitto '$ACL_FILE' && chmod 0600 '$ACL_FILE'" \
      || rollback_now
    printf '\n# --- CIMCMS %s: ACL for password_file users (same access as before)\nacl_file %s\n' "$TS" "$ACL_FILE" >> "$CONF"
    green "acl_file created: existing users keep full access"
  fi
  dx "$CONTAINER" sh -c "mosquitto_ctrl dynsec init '$DYNSEC_FILE' '$ADMIN_USER' \"\$1\" >/dev/null && chown mosquitto:mosquitto '$DYNSEC_FILE'" _ "$ADMIN_PW" \
    || rollback_now
  cat >> "$CONF" <<EOF

# --- CIMCMS $TS: Dynamic Security plugin (device accounts created by the API).
# password_file / acl_file above stay in use for existing users (e.g. mqttuser).
plugin $PLUGIN
plugin_opt_config_file $DYNSEC_FILE
EOF
  green "plugin added, admin '$ADMIN_USER' created"
else
  step "2. Plugin already enabled: resetting the password of '$ADMIN_USER' needs the old one; skipping admin creation"
  die "plugin already enabled. Create accounts with mosquitto_ctrl by hand (see runbook step 13)."
fi

step "3. Restart broker"
docker restart "$CONTAINER" >/dev/null
wait_up || rollback_now
green "broker up, admin login works"

step "4. Create the API account '$BACKEND_USER' (only the topics the API needs)"
# $1 = dynsec sub-command (expanded here); \$1 inside the container shell = admin password.
# mosquitto_ctrl exits 0 even when it prints an error: treat "Error"/"error" in the output as failure.
ctrl() { dx "$CONTAINER" sh -c "out=\$(mosquitto_ctrl -p $PORT -u $ADMIN_USER -P \"\$1\" dynsec $1 2>&1); rc=\$?; case \"\$out\" in *Error*|*error*) rc=1;; esac; printf '%s\n' \"\$out\" | grep -v -e 'without encryption' -e 'visible on the network' -e '^\$' >&2; exit \$rc" _ "$ADMIN_PW"; }
ctrl "createRole $BACKEND_USER" >/dev/null || rollback_now
for t in status telemetry ack event; do
  ctrl "addRoleACL $BACKEND_USER subscribeLiteral cimcms/led/+/$t allow" >/dev/null || rollback_now
  ctrl "addRoleACL $BACKEND_USER publishClientReceive cimcms/led/+/$t allow" >/dev/null || rollback_now
done
ctrl "addRoleACL $BACKEND_USER subscribeLiteral cimcms/humidifier/+/status allow" >/dev/null || rollback_now
ctrl "addRoleACL $BACKEND_USER publishClientReceive cimcms/humidifier/+/status allow" >/dev/null || rollback_now
for t in command config; do
  ctrl "addRoleACL $BACKEND_USER publishClientSend cimcms/led/+/$t allow" >/dev/null || rollback_now
done
ctrl "addRoleACL $BACKEND_USER publishClientSend cimcms/backend/status allow" >/dev/null || rollback_now
ctrl "addRoleACL $BACKEND_USER subscribeLiteral cimcms/backend/status allow" >/dev/null || rollback_now
ctrl "addRoleACL $BACKEND_USER publishClientReceive cimcms/backend/status allow" >/dev/null || rollback_now
dx "$CONTAINER" sh -c "mosquitto_ctrl -p $PORT -u $ADMIN_USER -P \"\$1\" dynsec createClient $BACKEND_USER -p \"\$2\" >/dev/null 2>&1" _ "$ADMIN_PW" "$BACKEND_PW" || rollback_now
ctrl "addClientRole $BACKEND_USER $BACKEND_USER" >/dev/null || rollback_now
green "account '$BACKEND_USER' created"

step "5. Verify"
# The API account can publish its status and read it back.
dx "$CONTAINER" sh -c "
  (mosquitto_sub -p $PORT -u $BACKEND_USER -P \"\$1\" -i cimcms-harden-check-sub -t cimcms/backend/status -C 1 -W 5 > /tmp/harden-check.txt) &
  sleep 1
  mosquitto_pub -p $PORT -u $BACKEND_USER -P \"\$1\" -i cimcms-harden-check-pub -t cimcms/backend/status -m '{\"state\":\"offline\"}' -r -q 1
  sleep 2; grep -q offline /tmp/harden-check.txt" _ "$BACKEND_PW" || { red "API account check failed"; rollback_now; }
green "API account: login + topics OK"
# A wrong password is refused.
if dx "$CONTAINER" sh -c "mosquitto_pub -p $PORT -u $BACKEND_USER -P wrong-password -t cimcms/backend/status -m x" >/dev/null 2>&1; then
  red "a wrong password was accepted"; rollback_now
fi
green "wrong password refused"
# Optional: prove mqttuser still works.
if [ -n "${MQTTUSER_PASSWORD:-}" ]; then
  dx "$CONTAINER" sh -c "
    (mosquitto_sub -p $PORT -u mqttuser -P \"\$1\" -i cimcms-harden-check-mq -t test/cimcms-harden -C 1 -W 5 > /tmp/harden-mq.txt) &
    sleep 1
    mosquitto_pub -p $PORT -u mqttuser -P \"\$1\" -t test/cimcms-harden -m ok
    sleep 2; grep -q ok /tmp/harden-mq.txt" _ "$MQTTUSER_PASSWORD" || { red "mqttuser check failed"; rollback_now; }
  green "mqttuser still works (pub/sub)"
else
  echo "mqttuser not tested (set MQTTUSER_PASSWORD=... to include it). Check the Humidifier reconnects: docker logs --tail 20 $CONTAINER"
fi

# ------------------------------------------------------------------ result
OUT="$DIR/cimcms-mqtt-credentials-$TS.txt"
umask 077
cat > "$OUT" <<EOF
# CIMCMS broker accounts created $TS on $(hostname). Move these into your password manager,
# put them into the API's .env, then DELETE this file.
MQTT_USERNAME=$BACKEND_USER
MQTT_PASSWORD=$BACKEND_PW
MQTT_PROVISIONING=dynsec
MQTT_ADMIN_USERNAME=$ADMIN_USER
MQTT_ADMIN_PASSWORD=$ADMIN_PW
EOF
DONE=1
trap - EXIT
step "Done"
green "Broker hardened. Existing users (${USERS:-mqttuser}) are unchanged."
echo "Values for the API's apps/api/.env (also saved, root-only, in $OUT):"
echo "------------------------------------------------------------------"
grep -v '^#' "$OUT"
echo "------------------------------------------------------------------"
echo "Backup: $BACKUP    Rollback: $0 --rollback $BACKUP"
red "Port $PORT is still plain MQTT: these passwords travel unencrypted. Add TLS (runbook steps 7-9) next."
