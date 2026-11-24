#!/bin/sh
# Applies pending database migrations, then starts the API (CMD).
# Safe because exactly ONE api instance runs (plan D-3); prisma also takes an advisory lock.
set -e
node node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma
exec "$@"
