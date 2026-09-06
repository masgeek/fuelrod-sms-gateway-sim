# FuelRod SMS Gateway

Express 5 SMS mock gateway. Accepts SMS send requests, stores them in PostgreSQL or SQLite, and fires async callbacks with randomized delivery statuses.

## Quick Start

```bash
pnpm install
pnpm dev              # SQLite (default)
pnpm build && pnpm start  # Production build
```

## Database

Supports **PostgreSQL** (production) and **SQLite** (local dev/tests).

### Configuration

Set `DB_TYPE` to switch between databases:

```bash
# PostgreSQL
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sms_gateway
DB_USER=sms_user
DB_PASSWORD=secret

# Or use full connection string
DATABASE_URL=postgresql://user:pass@localhost:5432/sms_gateway

# SQLite
DB_TYPE=sqlite
SQLITE_DB_PATH=./data/sms.db
```

### Migrations

```bash
pnpm db:migrate          # Apply migrations to PostgreSQL
pnpm db:migrate:dev      # Create new migration
pnpm db:generate         # Regenerate Prisma client
pnpm db:studio           # Open Prisma Studio
```

### Data Migration

Migrate existing SQLite data to PostgreSQL:

```bash
DB_TYPE=postgresql DB_HOST=localhost DB_PORT=5432 DB_NAME=sms_gateway DB_USER=sms_user DB_PASSWORD=secret pnpm migrate:sqlite-to-pg
```

## Docker

```bash
docker compose up        # Starts PostgreSQL + SMS Gateway
```

The gateway waits for PostgreSQL to be healthy before starting.

## API

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/send-sms` | Send SMS |
| `GET` | `/api/v1/sms-status/:messageId` | Get message status |
| `GET` | `/api/v1/messages` | List messages (paginated) |
| `GET` | `/api/v1/callback-queue` | List callback queue |
| `GET` | `/api/v1/failed-callbacks` | List failed callbacks |
| `GET` | `/api/docs` | Swagger UI |

### Example Request

```bash
curl -X POST http://localhost:3000/api/v1/send-sms \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+254712345678", "message": "Hello"}'
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `80` | Server port |
| `NODE_ENV` | `production` | Environment |
| `DB_TYPE` | `sqlite` | Database type (`postgresql` or `sqlite`) |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `sms_gateway` | Database name |
| `DB_USER` | `sms_user` | Database user |
| `DB_PASSWORD` | - | Database password |
| `DATABASE_URL` | - | Full PostgreSQL URL (overrides individual settings) |
| `SQLITE_DB_PATH` | `./data/sms.db` | SQLite file path |
| `SMS_CALLBACK_URL` | `https://n8n.munywele.co.ke/webhook/fuelrod-sms-gateway` | Primary callback URL |
| `SMS_FALLBACK_CALLBACK_URL` | `https://api.munywele.co.ke/v1/callback/dlr` | Fallback callback URL |
| `MAX_RETRIES` | `3` | Callback retry attempts |
| `MESSAGE_TTL_MS` | `3600000` | Message TTL (1 hour) |
| `CLEANUP_INTERVAL_MS` | `300000` | Cleanup interval (5 min) |

## Testing

```bash
pnpm test             # Single run
pnpm test:watch       # Watch mode
pnpm test:coverage    # With coverage
```

Tests use in-memory SQLite (via `.env.testing`).

## Architecture

- **Entry**: `src/index.ts` → `src/app.ts`
- **Routes**: `src/routes/SmsRoutes.ts` → `src/controllers/SmsController.ts`
- **Storage**: `src/services/MessageStore.ts` — Prisma (PostgreSQL) or better-sqlite3 (SQLite)
- **Validation**: Zod v4 schemas in `src/validators/SmsValidator.ts`
- **Config**: `src/config/env.ts` — loads `.env.production` → `.env.testing`/`.env.${NODE_ENV}` → `.env`
- **Prisma**: `prisma/schema.prisma` — schema definition and migrations

## License

APACHE2
