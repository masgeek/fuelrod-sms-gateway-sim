import express, {Request, Response} from 'express';
import {v4 as uuidv4} from 'uuid';

const app = express();
const PORT = 3000;

app.use(express.json());

interface SMSMessage {
    to: string;
    message: string;
    status: 'queued' | 'delivered';
    timestamp: string;
}

const messages = new Map<string, SMSMessage>();

app.post('/send-sms', (req: Request, res: Response) => {
    const {to, message} = req.body;

    if (!to || !message) {
        return res.status(400).json({error: 'Missing "to" or "message"'});
    }

    const messageId = uuidv4();
    const timestamp = new Date().toISOString();

    messages.set(messageId, {
        to,
        message,
        status: 'queued',
        timestamp
    });

    // Simulate delivery after 3 seconds
    setTimeout(() => {
        const record = messages.get(messageId);
        if (record) {
            record.status = 'delivered';
        }
    }, 3000);

    res.status(202).json({message: 'SMS queued for delivery.', messageId});
});

app.get('/sms-status/:messageId', (req: Request, res: Response) => {
    const messageId = req.params.messageId;
    const record = messages.get(messageId);

    if (!record) {
        return res.status(404).json({error: 'Message not found'});
    }

    res.json({
        messageId,
        to: record.to,
        status: record.status,
        timestamp: record.timestamp
    });
});

app.listen(PORT, () => {
    console.log(`📡 SMS Gateway running at http://localhost:${PORT}`);
});
