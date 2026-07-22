import axios from 'axios';
import {logger} from '../utils/logger';
import {MessageStore} from './MessageStore';

const BASE_TIMEOUT_MS = 5000;
const MAX_CALLBACK_ATTEMPTS = parseEnvInt(process.env.MAX_CALLBACK_ATTEMPTS, 3);

function parseEnvInt(value: string | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export interface CallbackRetryParams {
    url: string;
    fallbackUrl?: string;
    callBackData: Record<string, any>;
    max_retries?: number;
    attempt?: number;
}

export const messages = new MessageStore();
messages.startCleanup();

async function postCallback(url: string, payload: Record<string, any>, timeoutMs?: number): Promise<void> {
    const response = await axios.post(url, payload, {timeout: timeoutMs ?? BASE_TIMEOUT_MS});

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`Non-success response: ${response.status}`);
    }
}

export async function sendCallbackWithRetry({
                                                url,
                                                fallbackUrl,
                                                callBackData,
                                                max_retries = 1,
                                                attempt = 0
                                            }: CallbackRetryParams): Promise<void> {
    try {
        await postCallback(url, {...callBackData, retry_count: attempt});
        logger.info(`Callback succeeded on ${url} (attempt ${attempt + 1})`);
    } catch (err: any) {
        logger.warn(`Callback attempt ${attempt + 1} failed on ${url}: ${err.message}`);

        if (attempt < max_retries - 1) {
            await sendCallbackWithRetry({url, fallbackUrl, callBackData, max_retries, attempt: attempt + 1});
        } else if (fallbackUrl) {
            logger.warn(`Primary ${url} exhausted — trying fallback ${fallbackUrl}`);
            await sendCallbackWithRetry({url: fallbackUrl, callBackData, max_retries, attempt: 0});
        } else {
            logger.error(`Callback failed after ${max_retries} attempts`, {url, lastError: err.message});
        }
    }
}

function startCallbackWorker(): void {
    const timer = setInterval(async () => {
        const batch = messages.dequeuePendingCallbacksBatch(100);
        if (batch.length === 0) return;

        logger.info(`Callback worker: processing ${batch.length} callbacks`);

        const promises = batch.map(async (job) => {
            let payload: Record<string, any>;
            try {
                payload = JSON.parse(job.payload);
            } catch {
                logger.error(`Corrupt callback payload (id=${job.id}) — discarding`);
                messages.markCallbackQueueFailed(job.id);
                return;
            }

            const targetUrl = job.attempts === 0 ? job.url : (job.fallback_url ?? job.url);

            try {
                await postCallback(targetUrl, payload);
                logger.info(`Callback worker: success (id=${job.id}, url=${targetUrl})`);
                messages.markCallbackQueueSuccess(job.id);
                if (payload.message_id) {
                    messages.markCallbackStatus(payload.message_id, 'sent');
                }
            } catch (err: any) {
                if (job.attempts >= job.max_attempts) {
                    logger.error(`Callback worker: permanently failed (id=${job.id})`, {lastError: err.message});
                    messages.markCallbackQueueFailed(job.id);
                    if (payload.message_id) {
                        messages.markCallbackStatus(payload.message_id, 'failed');
                    }
                } else {
                    logger.warn(`Callback worker: retry (id=${job.id}, attempt=${job.attempts + 1}/${job.max_attempts})`, {lastError: err.message});
                    messages.markCallbackQueueRetry(job.id, job.attempts + 1, 0, err.message);
                }
            }
        });

        await Promise.all(promises);
    }, 30_000); // Run every 30 seconds

    timer.unref();
}

startCallbackWorker();
