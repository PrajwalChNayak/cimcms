# Stage 1: install dependencies and build
FROM node:20 AS builder
WORKDIR /usr/src/app

# Install PM2 globally if you still want process management
RUN npm install -g pm2

COPY package*.json ./
RUN npm ci

# Prisma and TS build
COPY . .
RUN npm run gp
RUN npm run build

# Stage 2: runtime image
FROM node:20 AS runner
WORKDIR /usr/src/app

# Copy required artifacts only
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json

EXPOSE 3814

# Start the compiled app
CMD ["pm2-runtime", "dist/app.js"]