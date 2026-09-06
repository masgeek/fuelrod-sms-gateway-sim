# AGENTS.md

## Quick commands

```bash
pnpm install
pnpm build            # tsc → dist/
pnpm dev              # ts-node-dev with NODE_ENV=development (SQLite)
pnpm test             # jest (single run)
pnpm test:watch       # jest --watch
pnpm test:coverage    # jest --coverage
```

No separate lint/typecheck step exists — `pnpm build` (tsc) is the typecheck.

## Project

Express 5 SMS mock gateway. Accepts SMS send requests, stores them in PostgreSQL or SQLite, and fires async callbacks with randomized delivery statuses.

- **Entry**: `src/index.ts` → `src/app.ts`
- **Routes**: `src/routes/SmsRoutes.ts` → `src/controllers/SmsController.ts`
- **Storage**: `src/services/MessageStore.ts` — Prisma (PostgreSQL) or better-sqlite3 (SQLite)
- **Validation**: Zod v4 schemas in `src/validators/SmsValidator.ts` (uses `sendSmsSchemaStrict`, not `sendSmsSchema`)
- **Middleware**: rate limiter (`src/middleware/rateLimiter.ts`), request logging, global error handler
- **Config**: `src/config/env.ts` — loads `.env.production` → `.env.testing`/`.env.${NODE_ENV}` → `.env`
- **Prisma**: `prisma/schema.prisma` — schema definition, `prisma/migrations/` for versioned migrations

## Database

```bash
# Switch database via DB_TYPE env var
DB_TYPE=postgresql  # Production
DB_TYPE=sqlite      # Local dev (default)

# Prisma commands
pnpm db:migrate          # Apply migrations
pnpm db:migrate:dev      # Create new migration
pnpm db:generate         # Regenerate Prisma client
pnpm db:studio           # Open Prisma Studio
pnpm migrate:sqlite-to-pg  # Migrate data from SQLite to PostgreSQL
```

## Testing

- Jest + ts-jest + supertest
- Tests live in `src/__tests__/**/*.test.ts`
- Tests mock `SmsService.sendCallbackWithRetry` and the logger — no HTTP callbacks fire during tests
- `messages` table is cleared in `beforeEach`
- Import `ulid` (not `uuid`) when generating test message IDs — `sendSmsSchemaStrict` only validates non-empty strings
- Tests use in-memory SQLite via `.env.testing` (`DB_TYPE=sqlite`)

## Gotchas

- Default `PORT` is `80`, not 3000. Docker maps `3002:3000` — the container listens on 3000 (set in `.env.production`)
- Message IDs are `FR_${ulid()}` — the status endpoint strips the `FR_` prefix before ULID validation, then uses the original `FR_`-prefixed key for the Map lookup
- `sendSmsSchema` (lenient) and `sendSmsSchemaStrict` both exist. The controller uses the strict one. Don't switch them
- `EnrichCarrier.enrichCarrierInfo` is stubbed to return `null` — don't add a route that depends on carrier data being real
- `getAllSmsMessages` controller exists but has no registered route — it's dead code unless wired up
- Production runs via PM2 (`ecosystem.config.js`) with `dist/index.js`
- `pnpm prod` script has a typo (`indes.ts`) — don't use it
- SQLite DB path: defaults to `./data/sms.db`, configurable via `SQLITE_DB_PATH`. Docker creates `data/` owned by `app` user
- PostgreSQL: uses Prisma ORM, migrations in `prisma/migrations/`

## Robustness

- **Graceful shutdown**: SIGTERM/SIGINT handlers drain in-flight requests (10s timeout)
- **Rate limiting**: 1000 req/s per IP (configurable via `RATE_LIMIT_MAX`). Returns `429` with `Retry-After` header
- **Body size limit**: `express.json({ limit: '100kb' })`
- **Axios timeout**: 5s on callback requests
- **Message cleanup**: TTL-based eviction (default 1h, configurable via `MESSAGE_TTL_MS`)
- **Request logging**: method, path, status, duration via Winston
- **Callback queue**: async worker polls every 30s, processes batch of 100, parallel execution
- **Fallback callbacks**: primary URL fails → tries fallback URL
