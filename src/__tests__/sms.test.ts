import request from 'supertest';
import app from '../app';

jest.mock('../services/SmsService', () => {
    const actual = jest.requireActual('../services/smsService');
    return {
        ...actual,
        sendCallbackWithRetry: jest.fn().mockResolvedValue(undefined),
    };
});


describe('SMS API', () => {
    it('should return 400 for missing fields', async () => {
        const res = await request(app).post('/api/v1/send-sms').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    it('should queue a valid SMS', async () => {
        const res = await request(app).post('/api/v1/send-sms').send({
            phone_number: '0712345678',
            message: 'Test message'
        });
        expect(res.status).toBe(202);
        expect(res.body.messageId).toBeDefined();
    });

    it('should return 404 for unknown messageId', async () => {
        const res = await request(app).get('/api/v1/sms-status/nonexistent-id');
        expect(res.status).toBe(404);
    });
});
