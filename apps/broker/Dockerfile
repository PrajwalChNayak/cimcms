# CIMCMS MQTT broker (@cimcms/broker, aedes). Logins and retained messages live in the CIMCMS
# PostgreSQL database (tables MqttAccount, MqttRetained).
# Build context = repo root:  docker build -f apps/broker/Dockerfile -t cimcms-broker:local .
#
# The broker never runs migrations: the API image applies them (prisma migrate deploy) at start.
# The broker image only needs a generated Prisma client.

# Stage 1: install dependencies, generate the Prisma client, build the bundle
FROM node:20 AS builder
WORKDIR /usr/src/app

# Manifests first so the dependency layer is cached.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/broker/package.json apps/broker/package.json
COPY apps/web/package.json apps/web/package.json
COPY tools/device-sim/package.json tools/device-sim/package.json
RUN npm ci --workspace apps/broker --workspace packages/contracts --include-workspace-root

COPY packages/contracts packages/contracts
COPY apps/broker apps/broker
# The schema is owned by the API; the broker shares the same database.
COPY apps/api/src/models/tables/schema.prisma apps/api/src/models/tables/schema.prisma
# Prisma CLI at exactly the version in the lockfile (the CLI is an API devDependency and is not
# installed for the broker workspace). Generates node_modules/.prisma/client.
# Contracts: JS only (no --dts), bundled into dist/main.js via tsup noExternal (same as the API image).
RUN npm exec -w @cimcms/contracts -- tsup src/index.ts --format esm --clean \
 && PRISMA_VERSION="$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version")" \
 && npx --yes "prisma@${PRISMA_VERSION}" generate --schema apps/api/src/models/tables/schema.prisma \
 && npm run build -w @cimcms/broker

# Stage 2: production dependencies only (no tsup/vitest/mqtt dev packages)
FROM node:20 AS deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/broker/package.json apps/broker/package.json
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
# Generated Prisma client (query engine for this platform) from the builder.
COPY --from=builder --chown=node:node /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /usr/src/app/apps/broker/dist ./dist
COPY --from=builder --chown=node:node /usr/src/app/apps/broker/package.json ./package.json

USER node
# 1883 MQTT, 8883 MQTTS (only when BROKER_TLS_CERT and BROKER_TLS_KEY are set), 8081 health
EXPOSE 1883 8883 8081

CMD ["node", "dist/main.js"]
