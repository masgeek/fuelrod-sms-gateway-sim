export interface SmsMessage {
    phone_number: string;
    message: string;
    status: 'MESSAGE_SENT' | 'DELIVERED' | 'FAILED';
    delivered_at?: string;
    timestamp: string;
}
