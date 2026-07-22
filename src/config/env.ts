import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../../');
const NODE_ENV = process.env.NODE_ENV || 'production';

const envFiles: string[] = [
    '.env.production',              // Load production defaults
    `.env.${NODE_ENV}`,             // Environment-specific overrides
    '.env'                          // Final local override
];

envFiles.forEach((file) => {
    const fullPath = path.join(ROOT_DIR, file);
    if (fs.existsSync(fullPath)) {
        dotenv.config({path: fullPath, override: true});
        if (NODE_ENV !== 'production') {
            console.log(`📦 Loaded env: ${file}`);
        }
    }
});

function parseNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildDatabaseUrl(): string {
    if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
    }

    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '5432';
    const database = process.env.DB_NAME || 'sms_gateway';
    const user = process.env.DB_USER || 'sms_user';
    const password = process.env.DB_PASSWORD || '';

    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export const config = {
    port: parseNumber(process.env.PORT, 80),
    callback_url: process.env.SMS_CALLBACK_URL || 'https://n8n.munywele.co.ke/webhook/fuelrod-sms-gateway',
    fallback_callback_url: process.env.SMS_FALLBACK_CALLBACK_URL || 'https://api.munywele.co.ke/v1/callback/dlr',
    fuelrod_api: process.env.FUELROD_API_URL || 'https://api.munywele.co.ke',
    max_retries: parseNumber(process.env.MAX_RETRIES, 3),
    env: NODE_ENV,
    db: {
        type: (process.env.DB_TYPE || 'sqlite') as 'postgresql' | 'sqlite',
        url: buildDatabaseUrl(),
        host: process.env.DB_HOST || 'localhost',
        port: parseNumber(process.env.DB_PORT, 5432),
        name: process.env.DB_NAME || 'sms_gateway',
        user: process.env.DB_USER || 'sms_user',
        password: process.env.DB_PASSWORD || '',
        sqlitePath: process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'data', 'sms.db'),
    },
};
