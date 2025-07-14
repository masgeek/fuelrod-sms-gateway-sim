import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const NODE_ENV = process.env.NODE_ENV || 'development';
const envPath = path.resolve(__dirname, '../../', `.env.${NODE_ENV}`);
const fallbackPath = path.resolve(__dirname, '../../', '.env.production');
const finalPath = fs.existsSync(envPath) ? envPath : fallbackPath;

dotenv.config({path: finalPath});

export const config = {
    port: Number(process.env.PORT) || 3000,
    callbackUrl: process.env.SMS_CALLBACK_URL || '',
    env: NODE_ENV,
};
