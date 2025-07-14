export interface SmsMessage {
    phone_number: string;
    message: string;
    status: 'QUEUED' | 'MESSAGE_SENT' | 'DELIVERED' | 'FAILED';
    timestamp: string;
}
