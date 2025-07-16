import {z} from 'zod';

export const sendSmsSchema = z.object({
    phone_number: z
        .string()
        .min(10, 'Phone number must be at least 10 digits')
        .max(15, 'Phone number cannot exceed 15 digits')
        .regex(/^\+?[\d\s\-\(\)]+$/, 'Phone number contains invalid characters')
        .transform((val) => val.replace(/[\s\-\(\)]/g, '')) // Remove formatting characters
        .refine((val) => /^\+?\d{10,15}$/.test(val), 'Invalid phone number format'),

    message: z
        .string()
        .min(1, 'Message cannot be empty')
        .max(1600, 'Message exceeds maximum length of 1600 characters')
        .trim()
});

// Schema for getting SMS status
export const getSmsStatusSchema = z.object({
    messageId: z
        .ulid('Invalid message ID format')
});

// Alternative with country code validation
export const sendSmsSchemaStrict = z.object({
    phone_number: z
        .string()
        .min(1, 'Phone number cannot be empty')
        // .regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in international format')
        .trim(),

    message: z
        .string()
        .min(1, 'Message cannot be empty')
        // .max(1600, 'Message exceeds maximum length of 1600 characters')
        .trim()
});

// Type exports for convenience
export type SendSmsRequest = z.infer<typeof sendSmsSchema>;
export type SendSmsRequestStrict = z.infer<typeof sendSmsSchemaStrict>;
export type GetSmsStatusRequest = z.infer<typeof getSmsStatusSchema>;
