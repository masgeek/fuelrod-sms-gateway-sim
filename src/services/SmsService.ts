import axios from 'axios';
import {logger} from '../utils/logger';
import {MessageStore} from './MessageStore';

const BASE_DELAY_MS = 2000;
const BASE_TIMEOUT_MS = 5000;
const TIMEOUT_JITTER_RATIO = 0.2; // ±20% jitter on timeout
const RETRY_WORKER_INTERVAL_MS = 300_000; // 5 min
const MAX_CALLBACK_ATTEMPTS = parseEnvInt(process.env.MAX_CALLBACK_ATTEMPTS, 5);
const CALLBACK_RATE_LIMIT = parseEnvInt(process.env.CALLBACK_RATE_LIMIT, 100); // per minute

function parseEnvInt(value: string | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

let callbackCount = 0;
let windowResetsAt = Date.now() + 60_000;

async function throttle(): Promise<void> {
    while (Date.now() >= windowResetsAt) {
        callbackCount = 0;
        windowResetsAt = Date.now() + 60_000;
    }
    if (callbackCount >= CALLBACK_RATE_LIMIT) {
        logger.warn(`Callback rate limit reached (${CALLBACK_RATE_LIMIT}/min) — waiting`);
    }
    while (callbackCount >= CALLBACK_RATE_LIMIT) {
        await new Promise(r => setTimeout(r, 100));
    }
    callbackCount++;
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
        await throttle();
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
            const baseDelay = BASE_DELAY_MS * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * BASE_DELAY_MS);
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
                `Callback failed after ${max_retries} attempts — enqueueing for retry`,
                {url, lastError: err.message}
            );

            messages.enqueueFailedCallback(url, callBackData, err.message, MAX_CALLBACK_ATTEMPTS);
        }
    }
}

function startCallbackRetryWorker(): void {
    const timer = setInterval(async () => {
        const pending = messages.dequeuePendingCallbacks(10);

        for (const job of pending) {
            let payload: Record<string, any>;
            try {
                payload = JSON.parse(job.payload);
            } catch {
                logger.error(`Corrupt callback payload (id=${job.id}) — discarding`);
                messages.markCallbackAbandoned(job.id);
                continue;
            }

            try {
                const baseTimeout = BASE_TIMEOUT_MS * Math.pow(2, job.attempts);
                const timeoutJitter = Math.floor(baseTimeout * TIMEOUT_JITTER_RATIO * Math.random());
                const timeoutMs = baseTimeout + timeoutJitter;
                await throttle();
                await postCallback(job.url, payload, timeoutMs);
                logger.info(`Retry worker: callback succeeded (id=${job.id}, attempt=${job.attempts})`);
                messages.markCallbackSucceeded(job.id);
            } catch (err: any) {
                if (job.attempts >= job.max_attempts) {
                    logger.error(
                        `Retry worker: callback permanently failed after ${job.attempts} attempts (id=${job.id}) — discarding`,
                        {url: job.url, lastError: err.message}
                    );
                    messages.markCallbackAbandoned(job.id);
                } else {
                    const delay = BASE_DELAY_MS * Math.pow(2, job.attempts);
                    logger.warn(
                        `Retry worker: callback failed (id=${job.id}, attempt=${job.attempts}/${job.max_attempts}) — retrying in ${delay}ms`,
                        {url: job.url, lastError: err.message}
                    );
                    messages.markCallbackRetry(job.id, job.attempts, delay, err.message);
                }
            }
        }
    }, RETRY_WORKER_INTERVAL_MS);

    timer.unref();
}

startCallbackRetryWorker();
