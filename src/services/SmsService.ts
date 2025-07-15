import axios from 'axios';
import {SmsMessage, SmsMessageResp} from '../models/SmsMessage';
import {logger} from '../utils/logger';

const BASE_DELAY_MS = 2000;

interface CallbackRetryParams {
    url: string;
    callBackData: Record<string, any>;
    max_retries?: number;
    attempt?: number;
}

export const messages = new Map<string, SmsMessageResp>();

export async function sendCallbackWithRetry({
                                                url,
                                                callBackData,
                                                max_retries = 1,
                                                attempt = 0
                                            }: CallbackRetryParams): Promise<void> {
    try {
        const response = await axios.post(
            url,
            {...callBackData, retry_count: attempt},
            {timeout: 5000} // optional: 5-second timeout
        );

        if (response.status < 200 || response.status >= 300) {
            throw new Error(`Non-success response: ${response.status}`);
        }

        logger.info(`✅ Callback succeeded (attempt ${attempt + 1})`);
    } catch (err: any) {
        logger.warn(`⚠️ Callback attempt ${attempt + 1} failed: ${err.message}`);

        if (attempt < max_retries - 1) {
            // Exponential backoff with jitter
            const baseDelay = BASE_DELAY_MS * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * BASE_DELAY_MS);
            const delay = baseDelay + jitter;

            logger.info(`⏳ Retrying callback in ${delay}ms (attempt ${attempt + 2}/${max_retries})`);

            await new Promise(resolve => setTimeout(resolve, delay));

            await sendCallbackWithRetry({
                url: url,
                callBackData: callBackData,
                max_retries: max_retries,
                attempt: attempt + 1
            });
        } else {
            logger.error(`❌ Callback failed after ${max_retries} attempts.`);
        }
    }
}
