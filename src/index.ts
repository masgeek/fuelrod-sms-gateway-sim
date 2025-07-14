import express, {Request, Response} from 'express';
import {v4 as uuidv4} from 'uuid';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Determine the env file to use
const NODE_ENV = process.env.NODE_ENV || 'development';
const envPath = path.resolve(__dirname, '..', `.env.${NODE_ENV}`);
const fallbackEnvPath = path.resolve(__dirname, '..', '.env.production');
const finalEnvPath = fs.existsSync(envPath) ? envPath : fallbackEnvPath;
dotenv.config({path: finalEnvPath});

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const callbackUrl = process.env.SMS_CALLBACK_URL;

app.use(express.json());

interface SMSMessage {
    phone_number: string;
    message: string;
    status: 'QUEUED' | 'MESSAGE_SENT' | 'DELIVERED' | 'FAILED';
    timestamp: string;
}

const messages = new Map<string, SMSMessage>();

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function sendCallbackWithRetry(
    url: string,
    payload: any,
    attempt: number = 0
): Promise<void> {
    try {
        await axios.post(url, {...payload, retry_count: attempt});
        console.log(`✅ Callback succeeded (attempt ${attempt + 1})`);
    } catch (err: any) {
        console.error(`⚠️ Callback attempt ${attempt + 1} failed: ${err.message}`);
        if (attempt < MAX_RETRIES - 1) {
            setTimeout(() => {
                sendCallbackWithRetry(url, payload, attempt + 1);
            }, RETRY_DELAY_MS);
        } else {
            console.error(`❌ Callback failed after ${MAX_RETRIES} attempts.`);
        }
    }
}

const apiRouter = express.Router();

apiRouter.post('/send-sms', (req: Request, res: Response) => {
    const {phone_number, message} = req.body;

    if (!phone_number || !message) {
        return res.status(400).json({error: 'Missing "phone_number" or "message"'});
    }

    const messageId = uuidv4();
    const timestamp = new Date().toISOString();

    messages.set(messageId, {
        phone_number,
        message,
        status: 'MESSAGE_SENT',
        timestamp,
    });

    // Simulate async delivery
    setTimeout(() => {
        const record = messages.get(messageId);
        if (!record) return;

        record.status = 'DELIVERED';

        if (callbackUrl) {
            const payload = {
                message_id: messageId,
                status: record.status,
                phone_number: record.phone_number,
                delivered_at: new Date().toISOString(),
            };
            sendCallbackWithRetry(callbackUrl, payload);
        }
    }, 3000);

    res.status(202).json({message: 'SMS queued for delivery.', messageId});
});

apiRouter.get('/sms-status/:messageId', (req: Request, res: Response) => {
    const record = messages.get(req.params.messageId);

    if (!record) {
        return res.status(404).json({error: 'Message not found'});
    }

    res.json({
        message_id: req.params.messageId,
        phone_number: record.phone_number,
        status: record.status,
        timestamp: record.timestamp,
    });
});

app.use('/api/v1', apiRouter);

app.listen(PORT, () => {
    console.log(`🚀 Running on http://localhost:${PORT}/api/v1 [${process.env.NODE_ENV}]`);
});
