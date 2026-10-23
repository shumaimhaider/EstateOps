import { z } from 'zod';

export const messageDtoSchema = z.object({
  id: z.string(),
  author_kind: z.enum(['customer', 'staff']),
  author_name: z.string(),
  body: z.string(),
  created_at: z.string(),
});

export const requestDtoSchema = z.object({
  id: z.string(),
  subject: z.string(),
  status: z.enum(['open', 'answered', 'closed']),
  booking_id: z.string().nullable(),
  created_at: z.string(),
  last_message_at: z.string(),
  message_count: z.number().int().optional(),
});

export const threadDtoSchema = requestDtoSchema.extend({ messages: z.array(messageDtoSchema) });
