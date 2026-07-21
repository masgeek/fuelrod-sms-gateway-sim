import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {SmsMessageResp} from '../models/SmsMessage';
import {logger} from '../utils/logger';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'sms.db');
const DEFAULT_TTL_MS = 3_600_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 300_000;

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

export class MessageStore {
    private db: Database.Database;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private ttlMs: number;

    constructor(dbPath?: string, ttlMs?: number) {
        const isTest = process.env.NODE_ENV === 'test';
        const resolvedPath = dbPath ?? (isTest ? ':memory:' : (process.env.SQLITE_DB_PATH ?? DEFAULT_DB_PATH));
        this.ttlMs = ttlMs ?? parseEnvInt(process.env.MESSAGE_TTL_MS, DEFAULT_TTL_MS);

        if (!isTest && resolvedPath !== ':memory:') {
            const dir = path.dirname(resolvedPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, {recursive: true});
            }
        }

        this.db = new Database(resolvedPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('busy_timeout = 5000');

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                message_id   TEXT PRIMARY KEY,
                phone_number TEXT    NOT NULL,
                network_code INTEGER NOT NULL DEFAULT 0,
                status       TEXT    NOT NULL,
                delivered_at TEXT,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS failed_callbacks (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                url          TEXT    NOT NULL,
                payload      TEXT    NOT NULL,
                attempts     INTEGER NOT NULL DEFAULT 0,
                max_attempts INTEGER NOT NULL DEFAULT 5,
                last_error   TEXT,
                next_retry   TEXT    NOT NULL,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
            )
        `);
    }

    startCleanup(intervalMs?: number): void {
        const ms = intervalMs ?? parseEnvInt(process.env.CLEANUP_INTERVAL_MS, DEFAULT_CLEANUP_INTERVAL_MS);
        this.cleanupTimer = setInterval(() => this.evictExpired(), ms);
        this.cleanupTimer.unref();
    }

    stopCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    get(key: string): SmsMessageResp | undefined {
        const row = this.db.prepare(
            'SELECT message_id, phone_number, network_code, status, delivered_at FROM messages WHERE message_id = ?'
        ).get(key) as any;

        if (!row) return undefined;

        return {
            message_id: row.message_id,
            phone_number: row.phone_number,
            network_code: row.network_code,
            status: row.status,
            delivered_at: row.delivered_at ?? undefined,
        };
    }

    set(key: string, value: SmsMessageResp): void {
        this.db.prepare(`
            INSERT OR REPLACE INTO messages (message_id, phone_number, network_code, status, delivered_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(key, value.phone_number, value.network_code, value.status, value.delivered_at ?? null);
    }

    has(key: string): boolean {
        const row = this.db.prepare('SELECT 1 FROM messages WHERE message_id = ?').get(key);
        return row !== undefined;
    }

    clear(): void {
        this.db.exec('DELETE FROM messages');
    }

    entries(): Array<[string, SmsMessageResp]> {
        const rows = this.db.prepare(
            'SELECT message_id, phone_number, network_code, status, delivered_at FROM messages'
        ).all() as any[];

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

    get size(): number {
        const row = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as any;
        return row.count;
    }

    evictExpired(): void {
        const cutoff = new Date(Date.now() - this.ttlMs).toISOString();
        const result = this.db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoff);
        if (result.changes > 0) {
            logger.info(`Evicted ${result.changes} expired messages (${this.size} remaining)`);
        }
    }

    enqueueFailedCallback(url: string, payload: Record<string, any>, lastError: string, maxAttempts = 5): number {
        const result = this.db.prepare(`
            INSERT INTO failed_callbacks (url, payload, attempts, max_attempts, last_error, next_retry)
            VALUES (?, ?, 1, ?, ?, datetime('now'))
        `).run(url, JSON.stringify(payload), maxAttempts, lastError);
        return Number(result.lastInsertRowid);
    }

    dequeuePendingCallbacks(limit = 10): FailedCallback[] {
        return this.db.prepare(`
            SELECT * FROM failed_callbacks
            WHERE next_retry <= datetime('now')
            ORDER BY next_retry ASC
            LIMIT ?
        `).all(limit) as FailedCallback[];
    }

    markCallbackRetry(id: number, attempt: number, nextDelayMs: number, lastError: string): void {
        const nextRetry = new Date(Date.now() + nextDelayMs).toISOString();
        this.db.prepare(`
            UPDATE failed_callbacks SET attempts = ?, next_retry = ?, last_error = ? WHERE id = ?
        `).run(attempt, nextRetry, lastError, id);
    }

    markCallbackSucceeded(id: number): void {
        this.db.prepare('DELETE FROM failed_callbacks WHERE id = ?').run(id);
    }

    markCallbackAbandoned(id: number): void {
        this.db.prepare('DELETE FROM failed_callbacks WHERE id = ?').run(id);
    }

    get pendingCallbackCount(): number {
        const row = this.db.prepare('SELECT COUNT(*) as count FROM failed_callbacks').get() as any;
        return row.count;
    }

    close(): void {
        this.stopCleanup();
        this.db.close();
    }
}
