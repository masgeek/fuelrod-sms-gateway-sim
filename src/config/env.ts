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

export const config = {
    port: parseNumber(process.env.PORT, 3000),
    callback_url: process.env.SMS_CALLBACK_URL || 'https://n8n.munywele.co.ke/webhook/fuelrod-sms-gateway',
    fuelrod_api: process.env.FUELROD_API_URL || 'https://api.munywele.co.ke',
    max_retries: parseNumber(process.env.MAX_RETRIES, 3),
    env: NODE_ENV,
};
