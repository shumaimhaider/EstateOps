import { z } from 'zod';

/** Customers' portal access and the support queue (staff side). */
export const portalAccessDtoSchema = z.union([
  z.object({ status: z.literal('none'), customer_id: z.string() }),
  z.object({
    customer_id: z.string(),
    email: z.string(),
    status: z.enum(['invited', 'active', 'disabled']),
    has_password: z.boolean(),
    invited_at: z.string().nullable(),
    last_login_at: z.string().nullable(),
    purpose: z.enum(['invite', 'reset']).optional(),
  }),
]);

export const supportMessageDtoSchema = z.object({
  id: z.string(),
  author_kind: z.enum(['customer', 'staff']),
  author_name: z.string(),
  body: z.string(),
  created_at: z.string(),
});

export const supportRequestDtoSchema = z.object({
  id: z.string(),
  subject: z.string(),
  status: z.enum(['open', 'answered', 'closed']),
  booking_id: z.string().nullable(),
  created_at: z.string(),
  last_message_at: z.string(),
  customer_id: z.string(),
  customer_name: z.string(),
  message_count: z.number().int().optional(),
});

export const supportThreadDtoSchema = supportRequestDtoSchema.extend({
  messages: z.array(supportMessageDtoSchema),
});

export const supportPageDtoSchema = z.object({
  data: z.array(supportRequestDtoSchema),
  next_cursor: z.string().nullable(),
  waiting: z.number().int(),
});
