# Build context = repo root:  docker build -f apps/api/Dockerfile -t cimcms-api:local .

# Stage 1: install dependencies and build
FROM node:20 AS builder
WORKDIR /usr/src/app

# Manifests first so the dependency layer is cached.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY tools/device-sim/package.json tools/device-sim/package.json
RUN npm ci --workspace apps/api --workspace packages/contracts --include-workspace-root

COPY packages/contracts packages/contracts
COPY apps/api apps/api
# Contracts: JS only (no --dts). The API bundles contracts via tsup noExternal; esbuild needs no
# .d.ts. The lockfile resolves contracts' own typescript to 7.x, which breaks tsup --dts on a
# clean npm ci (see PROGRESS note for T4.1).
RUN npm exec -w @cimcms/contracts -- tsup src/index.ts --format esm --clean \
 && npm run gp -w apps/api \
 && npm run build -w apps/api

# Stage 2: runtime image (not slim: Prisma engines need OpenSSL)
FROM node:20 AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

# curl is used by the compose healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pm2

COPY --from=builder --chown=node:node /usr/src/app/apps/api/dist ./dist
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/apps/api/package.json ./package.json
COPY --from=builder --chown=node:node /usr/src/app/apps/api/openapi.yaml ./openapi.yaml

# pm2 writes logs and state under $HOME/.pm2
ENV PM2_HOME=/tmp/.pm2
USER node
EXPOSE 3814

# Fork mode, exactly ONE instance (plan D-3). Never add -i / cluster mode.
CMD ["pm2-runtime", "dist/app.js"]
