import {Request, Response} from 'express';
import {v4 as uuidv4} from 'uuid';
import {messages, sendCallbackWithRetry} from '../services/SmsService';
import {config} from '../config/env';
import {SmsMessage} from '../models/SmsMessage';
import {sendSmsSchema, getSmsStatusSchema, sendSmsSchemaStrict} from '../validators/SmsValidator';
import {logger} from '../utils/logger';
import {ZodError} from 'zod';

/**
 * Formats Zod validation errors for better readability
 */
const formatValidationErrors = (error: ZodError) => {
    return error.issues.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
    }));
};

export const test = async (req: Request, res: Response): Promise<Response> => {
    return res.json({
        success: true,
        message: 'Hello world'
    });
}
/**
 * Send an SMS message
 */
export const sendSms = async (req: Request, res: Response): Promise<Response> => {
    try {
        const result = sendSmsSchemaStrict.safeParse(req.body);

        if (!result.success) {
            const validationErrors = formatValidationErrors(result.error);
            logger.warn(`❌ Invalid SMS request from ${req.ip}:`, validationErrors);

            return res.status(400).json({
                error: 'Validation failed',
                details: validationErrors
            });
        }

        const {phone_number, message} = result.data;
        const messageId = uuidv4();
        const timestamp = new Date().toISOString();

        const sms: SmsMessage = {
            phone_number,
            message,
            status: 'MESSAGE_SENT', // assume instant delivery
            timestamp
        };

        messages.set(messageId, sms);

        logger.info(`✅ SMS delivered instantly to ${phone_number} with ID ${messageId}`);

        // Immediately trigger callback if configured
        if (config.callbackUrl) {
            const payload = {
                message_id: messageId,
                status: sms.status,
                phone_number: sms.phone_number,
                deliveredAt: sms.delivered_at
            };

            sendCallbackWithRetry({
                    url: config.callbackUrl,
                    payload: payload,
                    max_retries: config.max_retries
                }
            ).catch(error => {
                logger.error(`Failed to send callback for ${messageId}:`, error);
            });
        }

        return res.status(202).json({
            success: true,
            message: 'SMS sent',
            data: {
                message_id: messageId,
                phone_number,
                status: sms.status,
                timestamp: sms.timestamp,
                delivered_at: sms.delivered_at
            }
        });

    } catch (error) {
        logger.error('❌ Unexpected error in sendSms:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to process SMS request'
        });
    }
};

/**
 * Get SMS delivery status
 */
export const getSmsStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
        const paramValidation = getSmsStatusSchema.safeParse({messageId: req.params.messageId});

        if (!paramValidation.success) {
            const validationErrors = formatValidationErrors(paramValidation.error);
            logger.warn(`❌ Invalid message ID format: ${req.params.messageId}`);

            return res.status(400).json({
                error: 'Invalid message ID format',
                details: validationErrors
            });
        }

        const {messageId} = paramValidation.data;
        const record = messages.get(messageId);

        if (!record) {
            logger.warn(`❌ Message not found: ${messageId}`);
            return res.status(404).json({
                error: 'Message not found',
                message: 'The requested message ID does not exist'
            });
        }

        logger.info(`📥 Status requested for ${messageId}`);

        return res.json({
            success: true,
            data: {
                message_id: messageId,
                phone_number: record.phone_number,
                status: record.status,
                timestamp: record.timestamp,
                ...(record.delivered_at && {delivered_at: record.delivered_at})
            }
        });

    } catch (error) {
        logger.error('❌ Unexpected error in getSmsStatus:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retrieve SMS status'
        });
    }
};

/**
 * Get all SMS messages (for debugging/admin purposes)
 */
export const getAllSmsMessages = async (req: Request, res: Response): Promise<Response> => {
    try {
        const allMessages = Array.from(messages.entries()).map(([id, message]) => ({
            id,
            ...message
        }));

        logger.info(`📊 Retrieved ${allMessages.length} SMS messages`);

        return res.json({
            success: true,
            data: allMessages,
            total: allMessages.length
        });

    } catch (error) {
        logger.error('❌ Unexpected error in getAllSmsMessages:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retrieve SMS messages'
        });
    }
};
