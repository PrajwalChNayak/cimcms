# CIMCMS MQTT broker (@cimcms/broker, aedes). Logins and retained messages live in the broker's
# OWN PostgreSQL database (BROKER_DATABASE_URL; tables MqttAccount, MqttRetained), separate from
# the application database of the API.
# Build context = repo root:  docker build -f apps/broker/Dockerfile -t cimcms-broker:local .
#
# The entrypoint applies the broker migrations (apps/broker/prisma/migrations) with
# `prisma migrate deploy` before it starts the broker.

# Stage 1: install dependencies, generate the broker Prisma client, build the bundle
FROM node:20 AS builder
WORKDIR /usr/src/app

# Manifests first so the dependency layer is cached. The broker schema is needed by the broker's
# postinstall (prisma generate) during npm ci.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/broker/package.json apps/broker/package.json
COPY apps/broker/prisma apps/broker/prisma
COPY apps/web/package.json apps/web/package.json
COPY tools/device-sim/package.json tools/device-sim/package.json
RUN npm ci --workspace apps/broker --workspace packages/contracts --include-workspace-root

COPY packages/contracts packages/contracts
COPY apps/broker apps/broker
# Generates apps/broker/src/generated/prisma (query engine for this platform) from the broker's
# own schema. Contracts: JS only (no --dts), bundled into dist/main.js via tsup noExternal.
# dist/main.js imports the generated client from ../src/generated/prisma (kept external).
RUN npm exec -w @cimcms/contracts -- tsup src/index.ts --format esm --clean \
 && npm run db:generate -w @cimcms/broker \
 && npm run build -w @cimcms/broker

# Stage 2: production dependencies only (no tsup/vitest/mqtt dev packages). The Prisma CLI is a
# broker dependency, so the image can run `prisma migrate deploy`.
FROM node:20 AS deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/broker/package.json apps/broker/package.json
COPY apps/broker/prisma apps/broker/prisma
COPY apps/web/package.json apps/web/package.json
COPY tools/device-sim/package.json tools/device-sim/package.json
RUN npm ci --omit=dev --workspace apps/broker --include-workspace-root

# Stage 3: runtime image (not slim: Prisma engines need OpenSSL)
FROM node:20 AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

# curl is used by the compose healthcheck (GET /health)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=deps --chown=node:node /usr/src/app/node_modules ./node_modules
# Generated broker Prisma client from the builder (dist/main.js imports ../src/generated/prisma).
COPY --from=builder --chown=node:node /usr/src/app/apps/broker/src/generated/prisma ./src/generated/prisma
COPY --from=builder --chown=node:node /usr/src/app/apps/broker/dist ./dist
COPY --from=builder --chown=node:node /usr/src/app/apps/broker/package.json ./package.json
# Broker schema + migrations: applied by the entrypoint before start.
COPY --from=builder --chown=node:node /usr/src/app/apps/broker/prisma ./prisma
COPY --chown=node:node apps/broker/docker-entrypoint.sh /usr/src/app/docker-entrypoint.sh
RUN chmod 0755 /usr/src/app/docker-entrypoint.sh

USER node
# 1883 MQTT, 8883 MQTTS (only when BROKER_TLS_CERT and BROKER_TLS_KEY are set), 8081 health
EXPOSE 1883 8883 8081

ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
