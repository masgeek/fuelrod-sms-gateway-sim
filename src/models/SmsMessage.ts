export type SmsStatus = 'MESSAGE_SENT' | 'DELIVERED_TO_HANDSET' | 'FAILED';

/**
 * Represents an SMS message stored or being processed.
 */
export interface SmsMessage {
    message_id: string;         // Unique message identifier
    phone_number: string;   // E.164 formatted phone number
    message: string;        // The text message content
    network_code: number;       // Network code
    status: SmsStatus;      // Current status of the message
    timestamp: string;      // ISO 8601 timestamp of when the message was sent
}

/**
 * Represents the structure of an SMS response payload.
 */
export interface SmsMessageResp {
    message_id: string;         // Unique message identifier
    phone_number: string;       // E.164 formatted phone number
    network_code: number;       // Network code
    status: SmsStatus;          // Delivery status
    delivered_at?: string;      // Timestamp of delivery (if delivered or failed)
}
