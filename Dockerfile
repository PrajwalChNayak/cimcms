# Stage 1: install dependencies and build
FROM node:20 AS builder
WORKDIR /usr/src/app



COPY package*.json ./
RUN npm ci

# Prisma and TS build
COPY . .
RUN npm run gp
RUN npm run build

# Stage 2: runtime image
FROM node:20 AS runner
WORKDIR /usr/src/app

# Install PM2 runtime globally (for pm2-runtime)
RUN npm install -g pm2

# Copy required artifacts only
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/openapi.yaml ./openapi.yaml
COPY --from=builder /usr/src/app/.env ./

EXPOSE 3814

# Start the compiled app
CMD ["pm2-runtime", "dist/app.js"]