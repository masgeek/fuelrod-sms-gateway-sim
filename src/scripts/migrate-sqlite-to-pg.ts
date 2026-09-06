/**
 * Migrate data from SQLite to PostgreSQL
 *
 * Usage:
 *   DB_TYPE=postgresql pnpm migrate:sqlite-to-pg
 *
 * Or with individual env vars:
 *   DB_HOST=localhost DB_PORT=5432 DB_NAME=sms_gateway DB_USER=sms_user DB_PASSWORD=secret pnpm migrate:sqlite-to-pg
 */

import Database from 'better-sqlite3';
import {PrismaClient} from '../generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import path from 'path';
import fs from 'fs';
import {config} from '../config/env';

const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH ?? path.resolve(process.cwd(), 'data', 'sms.db');

async function main() {
    if (config.db.type !== 'postgresql') {
        console.error('Error: DB_TYPE must be "postgresql" for this migration');
        process.exit(1);
    }

    if (!fs.existsSync(SQLITE_DB_PATH)) {
        console.error(`Error: SQLite database not found at ${SQLITE_DB_PATH}`);
        process.exit(1);
    }

    console.log(`Reading from SQLite: ${SQLITE_DB_PATH}`);
    console.log(`Writing to PostgreSQL: ${config.db.host}:${config.db.port}/${config.db.name}`);

    const sqlite = new Database(SQLITE_DB_PATH, {readonly: true});
    const adapter = new PrismaPg({connectionString: config.db.url});
    const prisma = new PrismaClient({adapter});

    try {
        // Migrate messages
        const messages = sqlite.prepare('SELECT * FROM messages').all() as any[];
        console.log(`Found ${messages.length} messages`);

        for (const msg of messages) {
            await prisma.message.upsert({
                where: {message_id: msg.message_id},
                update: {
                    phone_number: msg.phone_number,
                    network_code: msg.network_code,
                    status: msg.status,
                    callback_status: msg.callback_status ?? 'pending',
                    delivered_at: msg.delivered_at,
                    created_at: new Date(msg.created_at),
                    deleted_at: msg.deleted_at ? new Date(msg.deleted_at) : null,
                },
                create: {
                    message_id: msg.message_id,
                    phone_number: msg.phone_number,
                    network_code: msg.network_code,
                    status: msg.status,
                    callback_status: msg.callback_status ?? 'pending',
                    delivered_at: msg.delivered_at,
                    created_at: new Date(msg.created_at),
                    deleted_at: msg.deleted_at ? new Date(msg.deleted_at) : null,
                },
            });
        }
        console.log(`✓ Migrated ${messages.length} messages`);

        // Migrate failed callbacks
        const failedCallbacks = sqlite.prepare('SELECT * FROM failed_callbacks').all() as any[];
        console.log(`Found ${failedCallbacks.length} failed callbacks`);

        for (const fc of failedCallbacks) {
            await prisma.failedCallback.create({
                data: {
                    id: fc.id,
                    url: fc.url,
                    payload: fc.payload,
                    attempts: fc.attempts,
                    max_attempts: fc.max_attempts,
                    last_error: fc.last_error,
                    next_retry: new Date(fc.next_retry),
                    created_at: new Date(fc.created_at),
                },
            });
        }
        console.log(`✓ Migrated ${failedCallbacks.length} failed callbacks`);

        // Migrate callback queue
        const callbackQueue = sqlite.prepare('SELECT * FROM callback_queue').all() as any[];
        console.log(`Found ${callbackQueue.length} callback queue entries`);

        for (const cq of callbackQueue) {
            await prisma.callbackQueue.create({
                data: {
                    id: cq.id,
                    url: cq.url,
                    fallback_url: cq.fallback_url,
                    payload: cq.payload,
                    status: cq.status,
                    attempts: cq.attempts,
                    max_attempts: cq.max_attempts,
                    last_error: cq.last_error,
                    next_retry: new Date(cq.next_retry),
                    created_at: new Date(cq.created_at),
                },
            });
        }
        console.log(`✓ Migrated ${callbackQueue.length} callback queue entries`);

        console.log('\nMigration complete!');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        sqlite.close();
        await prisma.$disconnect();
    }
}

main();
