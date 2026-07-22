# syntax=docker/dockerfile:1

# ── Stage 1: Build ──────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable \
    && apk add --no-cache python3 make g++

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm prune --prod


# ── Stage 2: Runtime ────────────────────────────────────────────────
FROM node:24-alpine AS runtime

ENV NODE_ENV=production

RUN apk add --no-cache curl dumb-init \
    && addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --from=builder --chown=app:app /app/src/generated ./src/generated
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/ecosystem.config.js ./
COPY --from=builder --chown=app:app /app/prisma.config.ts ./

RUN mkdir -p data logs \
    && chown app:app data logs

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then npx prisma migrate deploy; fi && npx pm2-runtime ecosystem.config.js"]
