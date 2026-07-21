import {extendZodWithOpenApi, OpenAPIRegistry} from '@asteasolutions/zod-to-openapi';
import {z} from 'zod';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

const ErrorSchema = registry.register('Error', z.object({
    error: z.string(),
    message: z.string().optional(),
}));

const SendSmsRequest = registry.register('SendSmsRequest', z.object({
    phone_number: z.string().min(1).openapi({example: '+254712345678'}),
    message: z.string().min(1).max(1600).openapi({example: 'Hello from FuelRod'}),
}));

const SmsMessageResponse = registry.register('SmsMessageResponse', z.object({
    message_id: z.string().openapi({example: 'FR_01HXYZ...'}),
    phone_number: z.string().openapi({example: '+254712345678'}),
    message: z.string().openapi({example: 'Hello from FuelRod'}),
    status: z.enum(['MESSAGE_SENT', 'DELIVERED_TO_HANDSET', 'FAILED']),
    timestamp: z.string().openapi({example: '2025-01-15T10:30:00.000Z'}),
    network_code: z.number().openapi({example: 1}),
}));

const SmsStatusResponse = registry.register('SmsStatusResponse', z.object({
    message_id: z.string(),
    phone_number: z.string(),
    status: z.enum(['MESSAGE_SENT', 'DELIVERED_TO_HANDSET', 'FAILED']),
    network_code: z.number(),
    delivered_at: z.string().optional(),
}));

const HealthResponse = registry.register('HealthResponse', z.object({
    status: z.literal('ok'),
    uptime: z.number(),
    timestamp: z.string(),
}));

registry.registerPath({
    method: 'get',
    path: '/api/health',
    tags: ['Health'],
    summary: 'Health check',
    responses: {
        200: {
            description: 'Service is healthy',
            content: {'application/json': {schema: HealthResponse}},
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/v1/send-sms',
    tags: ['SMS'],
    summary: 'Send an SMS message',
    description: 'Accepts an SMS send request, stores it, and fires an async callback with a randomized delivery status.',
    request: {
        body: {required: true, content: {'application/json': {schema: SendSmsRequest}}},
    },
    responses: {
        202: {
            description: 'SMS accepted for delivery',
            content: {'application/json': {schema: z.object({
                success: z.literal(true),
                message: z.literal('SMS sent'),
                data: SmsMessageResponse,
            })}},
        },
        400: {
            description: 'Validation failed',
            content: {'application/json': {schema: z.object({
                error: z.literal('Validation failed'),
                response_code: z.literal(400),
                errors: z.array(z.object({
                    field: z.string(),
                    message: z.string(),
                    code: z.string(),
                })),
            })}},
        },
        429: {
            description: 'Rate limit exceeded',
            content: {'application/json': {schema: z.object({
                error: z.literal('Too many requests'),
                retry_after: z.number(),
            })}},
        },
    },
});

registry.registerPath({
    method: 'get',
    path: '/api/v1/sms-status/{messageId}',
    tags: ['SMS'],
    summary: 'Get SMS delivery status',
    description: 'Returns the delivery status of a previously sent SMS message.',
    request: {
        params: z.object({
            messageId: z.string().openapi({example: 'FR_01HXYZ...'}),
        }),
    },
    responses: {
        200: {
            description: 'SMS status retrieved',
            content: {'application/json': {schema: z.object({
                success: z.literal(true),
                data: SmsStatusResponse,
            })}},
        },
        400: {
            description: 'Invalid message ID format',
            content: {'application/json': {schema: z.object({
                error: z.literal('Invalid message ID format'),
                details: z.array(z.object({
                    field: z.string(),
                    message: z.string(),
                    code: z.string(),
                })),
            })}},
        },
        404: {
            description: 'Message not found',
            content: {'application/json': {schema: z.object({
                error: z.literal('Message not found'),
                message: z.string(),
            })}},
        },
    },
});
