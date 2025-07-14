import {z} from 'zod';

export const sendSmsSchema = z.object({
    phone_number: z.string().min(8, 'Phone number is too short'),
    message: z.string().min(1, 'Message cannot be empty')
});
