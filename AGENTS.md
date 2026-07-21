# AGENTS.md

## Quick commands

```bash
pnpm install
pnpm build            # tsc → dist/
pnpm dev              # ts-node-dev with NODE_ENV=development
pnpm test             # jest (single run)
pnpm test:watch       # jest --watch
pnpm test:coverage    # jest --coverage
```

No separate lint/typecheck step exists — `pnpm build` (tsc) is the typecheck.

## Project

Express 5 SMS mock gateway. Accepts SMS send requests, stores them in-memory (`Map`), and fires async callbacks with randomized delivery statuses. No database.

- **Entry**: `src/index.ts` → `src/app.ts`
- **Routes**: `src/routes/SmsRoutes.ts` → `src/controllers/SmsController.ts`
- **Validation**: Zod v4 schemas in `src/validators/SmsValidator.ts` (uses `sendSmsSchemaStrict`, not `sendSmsSchema`)
- **Env**: `src/config/env.ts` — loads `.env.production` → `.env.${NODE_ENV}` → `.env` in order (last wins)

## Testing

- Jest + ts-jest + supertest
- Tests live in `src/__tests__/**/*.test.ts`
- Tests mock `SmsService.sendCallbackWithRetry` and the logger — no HTTP callbacks fire during tests
- `messages` Map is cleared in `beforeEach`
- There are commented-out callback tests (marked `@TODO`) — don't uncomment without understanding the param name mismatch

## Gotchas

- Default `PORT` is `80`, not 3000. Docker maps `3002:3000` — the container listens on 3000 (set in `.env.production`)
- Message IDs are `FR_${ulid()}` — status validation uses Zod's `.ulid()` (the `FR_` prefix is stripped in tests via separate uuid import)
- `sendSmsSchema` (lenient) and `sendSmsSchemaStrict` both exist. The controller uses the strict one. Don't switch them
- `EnrichCarrier.enrichCarrierInfo` is stubbed to return `null` — don't add a route that depends on carrier data being real
- `getAllSmsMessages` controller exists but has no registered route — it's dead code unless wired up
- Production runs via PM2 (`ecosystem.config.js`) with `dist/index.js`
- `pnpm prod` script has a typo (`indes.ts`) — don't use it
