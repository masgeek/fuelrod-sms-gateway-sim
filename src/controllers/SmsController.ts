import {Request, Response} from 'express';
import {v4 as uuidv4} from 'uuid';
import {messages, sendCallbackWithRetry} from '../services/SmsService';
import {config} from '../config/env';
import {SmsMessage} from '../models/SmsMessage';
import {sendSmsSchema} from '../validators/SmsValidator';
import {logger} from '../utils/logger';

export const sendSms = (req: Request, res: Response) => {
    const result = sendSmsSchema.safeParse(req.body);

    if (!result.success) {
        logger.warn(`Invalid request: ${JSON.stringify(result.error.format())}`);
        return res.status(400).json({error: result.error.flatten()});
    }

    const {phone_number, message} = result.data;
    const messageId = uuidv4();
    const timestamp = new Date().toISOString();

    const sms: SmsMessage = {
        phone_number,
        message,
        status: 'MESSAGE_SENT',
        timestamp
    };

    messages.set(messageId, sms);

    logger.debug(`📨 Message queued for ${phone_number} with ID ${messageId}`);

    setTimeout(() => {
        const record = messages.get(messageId);
        if (!record) return;

        record.status = 'DELIVERED';

        logger.info(`✅ Message delivered: ${messageId}`);

        if (config.callbackUrl) {
            const payload = {
                message_id: messageId,
                status: record.status,
                phone_number: record.phone_number,
                deliveredAt: new Date().toISOString()
            };
            sendCallbackWithRetry(config.callbackUrl, payload);
        }
    }, 3000);

    return res.status(202).json({message: 'SMS queued for delivery.', messageId});
};

export const getSmsStatus = (req: Request, res: Response) => {
    const record = messages.get(req.params.messageId);
    if (!record) {
        logger.warn(`❌ Message not found: ${req.params.messageId}`);
        return res.status(404).json({error: 'Message not found'});
    }

    logger.info(`📥 Status requested for ${req.params.messageId}`);
    res.json({
        message_id: req.params.messageId,
        phone_number: record.phone_number,
        status: record.status,
        timestamp: record.timestamp
    });
};
