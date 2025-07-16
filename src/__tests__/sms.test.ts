import request from 'supertest';
import app from '../app';
import {messages} from '../services/SmsService';
import {v4 as uuidv4} from 'uuid';

jest.mock('../services/SmsService', () => {
    const actual = jest.requireActual('../services/SmsService');
    return {
        ...actual,
        sendCallbackWithRetry: jest.fn().mockResolvedValue(undefined),
    };
});


// Mock logger to suppress logs during tests
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }
}));


import * as SmsService from '../services/SmsService'; // 👈 import after mock
const mockSendCallbackWithRetry = SmsService.sendCallbackWithRetry as jest.Mock;

describe('SMS API', () => {
    beforeEach(() => {
        messages.clear();
        jest.clearAllMocks();
    });

    describe('POST /api/v1/send-sms', () => {
        it('should return 400 for missing request body', async () => {
            const res = await request(app)
                .post('/api/v1/send-sms')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Validation failed');
            expect(res.body.details).toBeDefined();
            expect(Array.isArray(res.body.details)).toBe(true);
        });

        it('should return 400 for invalid phone number', async () => {
            const res = await request(app)
                .post('/api/v1/send-sms')
                .send({
                    phone_number: '123',
                    message: 'Test message'
                });

            expect(res.status).toBe(400);
            expect(res.body.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        field: 'phone_number',
                        message: expect.any(String)
                    })
                ])
            );
        });

        it('should return 400 for empty message', async () => {
            const res = await request(app)
                .post('/api/v1/send-sms')
                .send({
                    phone_number: '+254712345678',
                    message: ''
                });

            expect(res.status).toBe(400);
            expect(res.body.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        field: 'message',
                        message: 'Message cannot be empty'
                    })
                ])
            );
        });

        it('should return 400 for message exceeding max length', async () => {
            const longMessage = 'a'.repeat(1601);
            const res = await request(app)
                .post('/api/v1/send-sms')
                .send({
                    phone_number: '+254712345678',
                    message: longMessage
                });

            expect(res.status).toBe(400);
            expect(res.body.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        field: 'message',
                        message: expect.stringContaining('exceeds maximum length')
                    })
                ])
            );
        });

        it('should not accept and normalize various phone formats', async () => {
            const numbers = ['(+25471) 234-5678', '+25471 234 5678'];

            for (const phoneNumber of numbers) {
                const res = await request(app)
                    .post('/api/v1/send-sms')
                    .send({phone_number: phoneNumber, message: 'Hello'});

                expect(res.status).toBe(400);
                expect(res.body.error).toBeDefined()
                expect(res.body.details).toBeDefined()
                expect(res.body.data).toBeUndefined();
            }
        });

        it('should successfully send and store a valid SMS', async () => {
            const res = await request(app)
                .post('/api/v1/send-sms')
                .send({
                    phone_number: '+254712345678',
                    message: 'Test message'
                });

            expect(res.status).toBe(202);
            expect(res.body.message).toBe('SMS sent');
            expect(res.body.data).toEqual(
                expect.objectContaining({
                    message_id: expect.any(String),
                    phone_number: '+254712345678',
                    status: 'MESSAGE_SENT',
                    timestamp: expect.any(String)
                })
            );

            expect(messages.has(res.body.data.message_id)).toBe(true);
        });

        it('should trim message whitespace', async () => {
            const res = await request(app)
                .post('/api/v1/send-sms')
                .send({
                    phone_number: '+254712345678',
                    message: '   Hello world   '
                });

            expect(res.status).toBe(202);
            const messageId = res.body.data.message_id;
            expect(messages.get(messageId)).toBeDefined();
        });
    });

    describe('GET /api/v1/sms-status/:messageId', () => {
        it('should return 400 for invalid UUID format', async () => {
            const res = await request(app).get('/api/v1/sms-status/invalid-id');

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid message ID format');
            expect(res.body.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        field: 'messageId'
                    })
                ])
            );
        });

        it('should return 404 for unknown message ID', async () => {
            const res = await request(app)
                .get(`/api/v1/sms-status/${uuidv4()}`);

            expect(res.status).toBe(404);
            expect(res.body.message).toBe('The requested message ID does not exist');
        });

        it('should return full status for delivered message', async () => {
            const createRes = await request(app)
                .post('/api/v1/send-sms')
                .send({phone_number: '+254712345678', message: 'Hello'});

            const messageId = createRes.body.data.message_id;

            const statusRes = await request(app)
                .get(`/api/v1/sms-status/${messageId}`);

            expect(statusRes.status).toBe(200);
            expect(statusRes.body.success).toBe(true);
            expect(statusRes.body.data).toEqual(
                expect.objectContaining({
                    message_id: messageId,
                    phone_number: '+254712345678',
                    status: 'MESSAGE_SENT',
                    delivered_at: expect.any(String)
                })
            );
        });
    });

    //@TODO: Fix this later

    // describe('Callback functionality', () => {
    //     it('should trigger callback with named params', async () => {
    //         const res = await request(app)
    //             .post('/api/v1/send-sms')
    //             .send({phone_number: '+254712345678', message: 'Test'});
    //
    //         const messageId = res.body.data.messageId;
    //
    //         expect(mockSendCallbackWithRetry).toHaveBeenCalledWith(
    //             expect.objectContaining({
    //                 url: expect.any(String),
    //                 callbackData: expect.objectContaining({
    //                     message_id: messageId,
    //                     phone_number: '+254712345678',
    //                     status: 'DELIVERED',
    //                     delivered_at: expect.any(String)
    //                 }),
    //                 max_retries: expect.any(Number)
    //             })
    //         );
    //     });
    // });

    describe('Error handling', () => {
        it('should respond with 500 if storing message fails', async () => {
            jest.spyOn(messages, 'set').mockImplementationOnce(() => {
                throw new Error('Simulated storage failure');
            });

            const res = await request(app)
                .post('/api/v1/send-sms')
                .send({phone_number: '+254712345678', message: 'Oops'});

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Internal server error');
        });
    });
});
