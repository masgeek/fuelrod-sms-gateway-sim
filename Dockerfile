# syntax=docker/dockerfile:1

# Stage 1: Build with pnpm
FROM node:24-alpine AS builder

WORKDIR /app

# Enable pnpm (pinned via packageManager field in package.json, ideally)
RUN corepack enable

# Copy dependency manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install deps with cache mount to speed up rebuilds
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Prune to production-only deps in a deploy-friendly output
RUN pnpm deploy --prod --filter=. /app/deploy


# Stage 2: Production runtime
FROM node:24-alpine AS production

ENV NODE_ENV=production

# Only what's actually needed at runtime; drop net-tools/bash unless a script needs them
RUN apk add --no-cache curl dumb-init

# Run as non-root
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Bring over pruned production node_modules + manifests from the deploy step
COPY --from=builder --chown=app:app /app/deploy/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/deploy/package.json ./package.json

# Build output and runtime config
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --chown=app:app ecosystem.config.js ./

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# dumb-init as PID 1 for correct signal forwarding to pm2-runtime
ENTRYPOINT ["dumb-init", "--"]
CMD ["npx", "pm2-runtime", "ecosystem.config.js"]