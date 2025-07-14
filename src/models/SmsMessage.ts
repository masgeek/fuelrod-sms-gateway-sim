export type SmsStatus = 'MESSAGE_SENT' | 'DELIVERED' | 'FAILED';

/**
 * Represents an SMS message stored or being processed.
 */
export interface SmsMessage {
    phone_number: string;   // E.164 formatted phone number
    message: string;        // The text message content
    status: SmsStatus;      // Current status of the message
    timestamp: string;      // ISO 8601 timestamp of when the message was sent
}

/**
 * Represents the structure of an SMS response payload.
 */
export interface SmsMessageResp {
    message_id: string;         // Unique message identifier
    phone_number: string;       // E.164 formatted phone number
    status: SmsStatus;          // Delivery status
    delivered_at?: string;      // Timestamp of delivery (if delivered or failed)
}
