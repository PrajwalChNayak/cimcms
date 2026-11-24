#!/bin/sh
# Applies pending migrations of the BROKER database (BROKER_DATABASE_URL; tables MqttAccount,
# MqttRetained), then starts the broker (CMD). Only one broker instance runs; prisma also takes an
# advisory lock. Set BROKER_MIGRATE=false to skip (for example when migrations are run by hand).
set -e
if [ "${BROKER_MIGRATE:-true}" != "false" ]; then
  node node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma
fi
exec "$@"
