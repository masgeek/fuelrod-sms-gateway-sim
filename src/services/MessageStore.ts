import {PrismaClient} from '../generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {SmsMessageResp} from '../models/SmsMessage';
import {logger} from '../utils/logger';
import {config} from '../config/env';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'sms.db');

function parseEnvInt(value: string | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export interface FailedCallback {
    id: number;
    url: string;
    payload: string;
    attempts: number;
    max_attempts: number;
    last_error: string | null;
    next_retry: string;
    created_at: string;
}

class PrismaStore {
    private client: PrismaClient;

    constructor(dbUrl: string) {
        const adapter = new PrismaPg({connectionString: dbUrl});
        this.client = new PrismaClient({adapter});
        this.client.$connect().catch((err: Error) => {
            logger.error('Prisma connect failed', err);
        });
    }

    async close(): Promise<void> {
        await this.client.$disconnect();
    }

    getClient(): PrismaClient {
        return this.client;
    }
}

class SqliteStore {
    private db: Database.Database;

    constructor(dbPath: string) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {recursive: true});
        }

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('busy_timeout = 5000');
    }

    runMigrations(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        `);

        const applied = new Set(
            (this.db.prepare('SELECT version FROM schema_migrations').all() as any[]).map(r => r.version)
        );

        for (const migration of SQLITE_MIGRATIONS) {
            if (!applied.has(migration.version)) {
                logger.info(`Running migration ${migration.version}`);
                this.db.transaction(() => {
                    migration.up(this.db);
                    this.db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
                })();
            }
        }
    }

    prepare(sql: string) {
        return this.db.prepare(sql);
    }

    exec(sql: string) {
        this.db.exec(sql);
    }

    close() {
        this.db.close();
    }
}

const SQLITE_MIGRATIONS: Array<{version: number; up: (db: Database.Database) => void}> = [
    {
        version: 1,
        up: (db) => {
            db.exec(`
                CREATE TABLE IF NOT EXISTS messages (
                    message_id     TEXT PRIMARY KEY,
                    phone_number   TEXT NOT NULL,
                    network_code   INTEGER NOT NULL DEFAULT 0,
                    status         TEXT NOT NULL,
                    delivered_at   TEXT,
                    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
                )
            `);
            db.exec(`
                CREATE TABLE IF NOT EXISTS failed_callbacks (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    url          TEXT NOT NULL,
                    payload      TEXT NOT NULL,
                    attempts     INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 5,
                    last_error   TEXT,
                    next_retry   TEXT NOT NULL,
                    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
                )
            `);
            db.exec(`
                CREATE TABLE IF NOT EXISTS callback_queue (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    url          TEXT NOT NULL,
                    fallback_url TEXT,
                    payload      TEXT NOT NULL,
                    status       TEXT NOT NULL DEFAULT 'pending',
                    attempts     INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 3,
                    last_error   TEXT,
                    next_retry   TEXT NOT NULL DEFAULT (datetime('now')),
                    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
                )
            `);
        }
    },
    {
        version: 2,
        up: (db) => {
            const hasCallbackStatus = db.prepare("SELECT name FROM pragma_table_info('messages') WHERE name = 'callback_status'").get();
            if (!hasCallbackStatus) {
                db.exec("ALTER TABLE messages ADD COLUMN callback_status TEXT NOT NULL DEFAULT 'pending'");
            }
        }
    },
    {
        version: 3,
        up: (db) => {
            const hasDeletedAt = db.prepare("SELECT name FROM pragma_table_info('messages') WHERE name = 'deleted_at'").get();
            if (!hasDeletedAt) {
                db.exec('ALTER TABLE messages ADD COLUMN deleted_at TEXT');
            }
        }
    },
];

type Store = PrismaStore | SqliteStore;

export class MessageStore {
    private store: Store;
    private isPg: boolean;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private ttlMs: number;

    constructor() {
        const isTest = process.env.NODE_ENV === 'test';
        const dbType = isTest ? 'sqlite' : config.db.type;

        if (dbType === 'postgresql') {
            this.isPg = true;
            this.store = new PrismaStore(config.db.url);
            this.ttlMs = parseEnvInt(process.env.MESSAGE_TTL_MS, 3_600_000);
        } else {
            this.isPg = false;
            const dbPath = isTest ? ':memory:' : config.db.sqlitePath;
            const store = new SqliteStore(dbPath);
            store.runMigrations();
            this.store = store;
            this.ttlMs = parseEnvInt(process.env.MESSAGE_TTL_MS, 3_600_000);
        }
    }

    private getTimestamp(): string {
        return this.isPg ? 'now()' : "datetime('now')";
    }

    private getPrisma(): PrismaClient {
        return (this.store as PrismaStore).getClient();
    }

    startCleanup(intervalMs?: number): void {
        const ms = intervalMs ?? parseEnvInt(process.env.CLEANUP_INTERVAL_MS, 300_000);
        this.cleanupTimer = setInterval(() => this.softDeleteExpired(), ms);
        this.cleanupTimer.unref();
    }

    stopCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    private async query(sql: string, params?: any[]): Promise<any[]> {
        if (this.isPg) {
            const result = await this.getPrisma().$queryRawUnsafe(sql, ...(params ?? []));
            return result as any[];
        } else {
            let idx = 0;
            const converted = sql.replace(/\$\d+/g, () => `?`);
            const stmt = (this.store as SqliteStore).prepare(converted);
            return params ? stmt.all(...params) as any[] : stmt.all() as any[];
        }
    }

    private async run(sql: string, params?: any[]): Promise<{changes: number; lastInsertRowid?: number}> {
        if (this.isPg) {
            const result = await this.getPrisma().$executeRawUnsafe(sql, ...(params ?? []));
            return {changes: result};
        } else {
            let idx = 0;
            const converted = sql.replace(/\$\d+/g, () => `?`);
            const stmt = (this.store as SqliteStore).prepare(converted);
            const result = params ? stmt.run(...params) : stmt.run();
            return {changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid)};
        }
    }

    private async getOne(sql: string, params?: any[]): Promise<any | null> {
        if (this.isPg) {
            const result = await this.getPrisma().$queryRawUnsafe(sql, ...(params ?? []));
            return (result as any[])[0] ?? null;
        } else {
            let idx = 0;
            const converted = sql.replace(/\$\d+/g, () => `?`);
            const stmt = (this.store as SqliteStore).prepare(converted);
            return (params ? stmt.get(...params) : stmt.get()) as any ?? null;
        }
    }

    async get(key: string): Promise<SmsMessageResp | undefined> {
        const row = await this.getOne(
            "SELECT message_id, phone_number, network_code, status, delivered_at FROM messages WHERE message_id = $1 AND deleted_at IS NULL",
            [key]
        );

        if (!row) return undefined;

        return {
            message_id: row.message_id,
            phone_number: row.phone_number,
            network_code: row.network_code,
            status: row.status,
            delivered_at: row.delivered_at ?? undefined,
        };
    }

    async set(key: string, value: SmsMessageResp): Promise<void> {
        if (this.isPg) {
            await this.run(
                'INSERT INTO messages (message_id, phone_number, network_code, status, delivered_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (message_id) DO UPDATE SET phone_number = $2, network_code = $3, status = $4, delivered_at = $5',
                [key, value.phone_number, value.network_code, value.status, value.delivered_at ?? null]
            );
        } else {
            await this.run(
                'INSERT OR REPLACE INTO messages (message_id, phone_number, network_code, status, delivered_at) VALUES (?, ?, ?, ?, ?)',
                [key, value.phone_number, value.network_code, value.status, value.delivered_at ?? null]
            );
        }
    }

    async has(key: string): Promise<boolean> {
        const row = await this.getOne(
            "SELECT 1 FROM messages WHERE message_id = $1 AND deleted_at IS NULL",
            [key]
        );
        return row !== null;
    }

    async clear(): Promise<void> {
        const ts = this.getTimestamp();
        await this.run(`UPDATE messages SET deleted_at = ${ts} WHERE deleted_at IS NULL`);
    }

    async entries(): Promise<Array<[string, SmsMessageResp]>> {
        const rows = await this.query(
            "SELECT message_id, phone_number, network_code, status, delivered_at FROM messages WHERE deleted_at IS NULL"
        );

        return rows.map(row => [
            row.message_id,
            {
                message_id: row.message_id,
                phone_number: row.phone_number,
                network_code: row.network_code,
                status: row.status,
                delivered_at: row.delivered_at ?? undefined,
            }
        ]);
    }

    async getSize(): Promise<number> {
        const row = await this.getOne("SELECT COUNT(*) as count FROM messages WHERE deleted_at IS NULL");
        return row?.count ?? 0;
    }

    async softDeleteExpired(): Promise<void> {
        const cutoff = new Date(Date.now() - this.ttlMs).toISOString();
        const ts = this.getTimestamp();
        const {changes} = await this.run(
            `UPDATE messages SET deleted_at = ${ts} WHERE created_at < $1 AND deleted_at IS NULL AND callback_status IN ('sent', 'failed')`,
            [cutoff]
        );
        if (changes > 0) {
            const size = await this.getSize();
            logger.info(`Soft-deleted ${changes} expired messages (${size} remaining)`);
        }
    }

    async markCallbackStatus(messageId: string, status: 'sent' | 'failed'): Promise<void> {
        await this.run('UPDATE messages SET callback_status = $1 WHERE message_id = $2', [status, messageId]);
    }

    async enqueueFailedCallback(url: string, payload: Record<string, any>, lastError: string, maxAttempts = 5): Promise<number> {
        const ts = this.getTimestamp();
        if (this.isPg) {
            const result = await this.getPrisma().$queryRawUnsafe(
                `INSERT INTO failed_callbacks (url, payload, attempts, max_attempts, last_error, next_retry) VALUES ($1, $2, 1, $3, $4, ${ts}) RETURNING id`,
                url, JSON.stringify(payload), maxAttempts, lastError
            ) as any[];
            return result[0].id;
        } else {
            const result = await this.run(
                `INSERT INTO failed_callbacks (url, payload, attempts, max_attempts, last_error, next_retry) VALUES (?, ?, 1, ?, ?, ${ts})`,
                [url, JSON.stringify(payload), maxAttempts, lastError]
            );
            return result.lastInsertRowid ?? 0;
        }
    }

    async dequeuePendingCallbacks(limit = 10): Promise<FailedCallback[]> {
        const ts = this.getTimestamp();
        return this.query(
            `SELECT * FROM failed_callbacks WHERE next_retry <= ${ts} ORDER BY next_retry ASC LIMIT $1`,
            [limit]
        );
    }

    async markCallbackRetry(id: number, attempt: number, nextDelayMs: number, lastError: string): Promise<void> {
        const nextRetry = new Date(Date.now() + nextDelayMs).toISOString();
        await this.run(
            'UPDATE failed_callbacks SET attempts = $1, next_retry = $2, last_error = $3 WHERE id = $4',
            [attempt, nextRetry, lastError, id]
        );
    }

    async markCallbackSucceeded(id: number): Promise<void> {
        await this.run('DELETE FROM failed_callbacks WHERE id = $1', [id]);
    }

    async markCallbackAbandoned(id: number): Promise<void> {
        await this.run('DELETE FROM failed_callbacks WHERE id = $1', [id]);
    }

    async getPendingCallbackCount(): Promise<number> {
        const row = await this.getOne('SELECT COUNT(*) as count FROM failed_callbacks');
        return row?.count ?? 0;
    }

    async enqueueCallback(url: string, fallbackUrl: string | undefined, payload: Record<string, any>, maxAttempts = 3): Promise<number> {
        if (this.isPg) {
            const result = await this.getPrisma().$queryRawUnsafe(
                'INSERT INTO callback_queue (url, fallback_url, payload, max_attempts) VALUES ($1, $2, $3, $4) RETURNING id',
                url, fallbackUrl ?? null, JSON.stringify(payload), maxAttempts
            ) as any[];
            return result[0].id;
        } else {
            const result = await this.run(
                'INSERT INTO callback_queue (url, fallback_url, payload, max_attempts) VALUES (?, ?, ?, ?)',
                [url, fallbackUrl ?? null, JSON.stringify(payload), maxAttempts]
            );
            return result.lastInsertRowid ?? 0;
        }
    }

    async dequeuePendingCallbacksBatch(limit = 100): Promise<Array<{id: number; url: string; fallback_url: string | null; payload: string; attempts: number; max_attempts: number}>> {
        const ts = this.getTimestamp();
        return this.query(
            `SELECT id, url, fallback_url, payload, attempts, max_attempts FROM callback_queue WHERE status = $1 AND next_retry <= ${ts} ORDER BY created_at ASC LIMIT $2`,
            ['pending', limit]
        );
    }

    async markCallbackQueueSuccess(id: number): Promise<void> {
        await this.run("UPDATE callback_queue SET status = 'sent' WHERE id = $1", [id]);
    }

    async markCallbackQueueRetry(id: number, attempt: number, nextDelayMs: number, lastError: string): Promise<void> {
        const nextRetry = new Date(Date.now() + nextDelayMs).toISOString();
        await this.run(
            'UPDATE callback_queue SET attempts = $1, next_retry = $2, last_error = $3 WHERE id = $4',
            [attempt, nextRetry, lastError, id]
        );
    }

    async markCallbackQueueFailed(id: number): Promise<void> {
        await this.run("UPDATE callback_queue SET status = 'failed' WHERE id = $1", [id]);
    }

    async getCallbackQueueSize(): Promise<number> {
        const row = await this.getOne("SELECT COUNT(*) as count FROM callback_queue WHERE status = 'pending'");
        return row?.count ?? 0;
    }

    async getAllMessages(limit = 20, offset = 0): Promise<any[]> {
        return this.query(
            'SELECT message_id, phone_number, network_code, status, callback_status, delivered_at, created_at FROM messages WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );
    }

    async getMessageCount(): Promise<number> {
        const row = await this.getOne('SELECT COUNT(*) as count FROM messages WHERE deleted_at IS NULL');
        return row?.count ?? 0;
    }

    async getAllCallbackQueue(limit = 20, offset = 0): Promise<any[]> {
        return this.query(
            'SELECT id, url, fallback_url, payload, status, attempts, max_attempts, last_error, next_retry, created_at FROM callback_queue ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );
    }

    async getCallbackQueueCount(): Promise<number> {
        const row = await this.getOne('SELECT COUNT(*) as count FROM callback_queue');
        return row?.count ?? 0;
    }

    async getAllFailedCallbacks(limit = 20, offset = 0): Promise<any[]> {
        return this.query(
            'SELECT id, url, payload, attempts, max_attempts, last_error, next_retry, created_at FROM failed_callbacks ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );
    }

    async getFailedCallbackCount(): Promise<number> {
        const row = await this.getOne('SELECT COUNT(*) as count FROM failed_callbacks');
        return row?.count ?? 0;
    }

    async close(): Promise<void> {
        this.stopCleanup();
        if (this.isPg) {
            await (this.store as PrismaStore).close();
        } else {
            (this.store as SqliteStore).close();
        }
    }
}
