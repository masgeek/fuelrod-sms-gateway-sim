import {Request, Response} from 'express';
import {v4 as uuidv4} from 'uuid';
import {messages, sendCallbackWithRetry} from '../services/SmsService';
import {config} from '../config/env';
import {SmsMessage} from '../models/SmsMessage';

export const sendSms = (req: Request, res: Response) => {
    const {phone_number, message} = req.body;

    if (!phone_number || !message) {
        return res.status(400).json({error: 'Missing "phone_number" or "message"'});
    }

    const messageId = uuidv4();
    const timestamp = new Date().toISOString();

    const sms: SmsMessage = {
        phone_number,
        message,
        status: 'MESSAGE_SENT',
        timestamp,
    };

    messages.set(messageId, sms);

    setTimeout(() => {
        const record = messages.get(messageId);
        if (!record) return;

        record.status = 'DELIVERED';

        if (config.callbackUrl) {
            const payload = {
                message_id: messageId,
                status: record.status,
                phone_number: record.phone_number,
                deliveredAt: new Date().toISOString(),
            };
            sendCallbackWithRetry(config.callbackUrl, payload);
        }
    }, 3000);

    return res.status(202).json({message: 'SMS queued for delivery.', messageId});
};

export const getSmsStatus = (req: Request, res: Response) => {
    const record = messages.get(req.params.messageId);
    if (!record) {
        return res.status(404).json({error: 'Message not found'});
    }

    res.json({
        message_id: req.params.messageId,
        phone_number: record.phone_number,
        status: record.status,
        timestamp: record.timestamp,
    });
};
