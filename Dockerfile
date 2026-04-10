# Stage 1: Build with pnpm
FROM node:24-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable

# Copy dependency manifests
COPY package.json pnpm-lock.yaml ./

# Install deps
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build


# Stage 2: Production runtime
FROM node:24-alpine AS production

WORKDIR /app

# Install utilities
RUN apk add --no-cache net-tools bash curl

# Enable pnpm
RUN corepack enable

# Copy manifests
COPY package.json pnpm-lock.yaml ./

# Install ONLY production deps
RUN pnpm install --frozen-lockfile --prod

# Install pm2 locally (not global)
RUN pnpm add pm2

# Copy build output
COPY --from=builder /app/dist ./dist

# Copy runtime config
COPY ecosystem.config.js ./

EXPOSE 3000

# Run via pnpm (no global bin issues)
CMD ["pnpm", "exec", "pm2-runtime", "ecosystem.config.js"]