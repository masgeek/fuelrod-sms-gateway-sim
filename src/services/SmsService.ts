import axios from 'axios';
import {SmsMessage} from '../models/SmsMessage';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export const messages = new Map<string, SmsMessage>();

export async function sendCallbackWithRetry(
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
