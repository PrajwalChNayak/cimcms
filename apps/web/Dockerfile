# Build context = repo root:  docker build -f apps/web/Dockerfile -t cimcms-web:local .

# Stage 1: build the SPA
FROM node:20 AS build
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY tools/device-sim/package.json tools/device-sim/package.json
RUN npm ci --workspace apps/web --workspace packages/contracts --include-workspace-root

COPY packages/contracts packages/contracts
COPY apps/web apps/web

# Same-origin deployment (plan D-6): only non-secret, build-time values.
ENV VITE_API_BASE_URL=/api \
    VITE_FF_CIMCMS=true
# Contracts JS only and `vite build` without the `tsc -b` step of `npm run build`: tsc needs the
# contracts .d.ts, whose tsup --dts build currently fails on a clean `npm ci` (lockfile resolves
# contracts' typescript to 7.x). Typechecking is done by CI/typecheck, not by the image build.
RUN npm exec -w @cimcms/contracts -- tsup src/index.ts --format esm --clean  && npm exec -w apps/web -- vite build

# Stage 2: Nginx serves the SPA and proxies /api and /socket.io
FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY infra/prod/nginx/cimcms.conf /etc/nginx/templates/cimcms.conf.template
COPY --from=build /usr/src/app/apps/web/dist /usr/share/nginx/html
EXPOSE 80 443
