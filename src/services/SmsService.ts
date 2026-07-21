import axios from 'axios';
import {logger} from '../utils/logger';
import {MessageStore} from './MessageStore';

const BASE_TIMEOUT_MS = 5000;
const TIMEOUT_JITTER_RATIO = 0.2;
const CALLBACK_BATCH_SIZE = parseEnvInt(process.env.CALLBACK_BATCH_SIZE, 500);
const CALLBACK_INTERVAL_MS = parseEnvInt(process.env.CALLBACK_INTERVAL_MS, 300_000); // 5 min
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
    const baseTimeout = BASE_TIMEOUT_MS * Math.pow(2, attempt);
    const timeoutJitter = Math.floor(baseTimeout * TIMEOUT_JITTER_RATIO * Math.random());
    const timeoutMs = baseTimeout + timeoutJitter;
    try {
        await postCallback(url, {...callBackData, retry_count: attempt}, timeoutMs);
        const {phone_number, ...data} = callBackData;
        logger.info(`Callback succeeded on ${url} (attempt ${attempt + 1})`, data);
    } catch (err: any) {
        logger.warn(
            `Callback attempt ${attempt + 1} failed on ${url}: ${err.message}`,
            {
                attempt: attempt + 1,
                maxRetries: max_retries,
                url,
                callBackDataSummary: JSON.stringify(callBackData).slice(0, 200),
            }
        );

        if (attempt < max_retries - 1) {
            const baseDelay = 2000 * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * 2000);
            const delay = baseDelay + jitter;

            await new Promise(resolve => setTimeout(resolve, delay));

            await sendCallbackWithRetry({
                url,
                fallbackUrl,
                callBackData,
                max_retries,
                attempt: attempt + 1
            });
        } else if (fallbackUrl) {
            logger.warn(`Primary ${url} exhausted — trying fallback ${fallbackUrl}`);
            await sendCallbackWithRetry({
                url: fallbackUrl,
                callBackData,
                max_retries,
                attempt: 0
            });
        } else {
            logger.error(
                `Callback failed after ${max_retries} attempts`,
                {url, lastError: err.message}
            );
        }
    }
}

function startCallbackWorker(): void {
    const CONCURRENCY = parseEnvInt(process.env.CALLBACK_CONCURRENCY, 10);

    const timer = setInterval(async () => {
        const batch = messages.dequeuePendingCallbacksBatch(CALLBACK_BATCH_SIZE);
        if (batch.length === 0) return;

        logger.info(`Callback worker: processing ${batch.length} callbacks (concurrency=${CONCURRENCY})`);

        let idx = 0;
        async function processNext(): Promise<void> {
            while (idx < batch.length) {
                const job = batch[idx++];
                let payload: Record<string, any>;
                try {
                    payload = JSON.parse(job.payload);
                } catch {
                    logger.error(`Corrupt callback payload (id=${job.id}) — discarding`);
                    messages.markCallbackQueueFailed(job.id);
                    continue;
                }

                const targetUrl = job.attempts === 0 ? job.url : (job.fallback_url ?? job.url);
                const timeoutMs = BASE_TIMEOUT_MS * Math.pow(2, job.attempts);

                try {
                    await postCallback(targetUrl, payload, timeoutMs);
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
                        const delay = 2000 * Math.pow(2, job.attempts);
                        logger.warn(`Callback worker: retry (id=${job.id}, attempt=${job.attempts + 1}/${job.max_attempts})`, {lastError: err.message});
                        messages.markCallbackQueueRetry(job.id, job.attempts + 1, delay, err.message);
                    }
                }
            }
        }

        const workers = Array.from({length: Math.min(CONCURRENCY, batch.length)}, () => processNext());
        await Promise.all(workers);
    }, CALLBACK_INTERVAL_MS);

    timer.unref();
}

startCallbackWorker();
