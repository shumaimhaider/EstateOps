import { z } from 'zod';

/** The new-booking form. Messages come from the caller's `t` so they are translated. */
export const createNewBookingSchema = ({ t, today }) =>
  z.object({
    unitId: z.string().min(1, t('new.errors.unit')),
    customerId: z.string().min(1, t('new.errors.customer')),
    planId: z.string().min(1, t('new.errors.plan')),
    bookedAt: z
      .string()
      .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), t('new.errors.date'))
      .refine((v) => v === '' || v <= today, t('new.errors.future')),
  });
