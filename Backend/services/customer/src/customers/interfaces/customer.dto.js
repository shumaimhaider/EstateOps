import { z } from 'zod';
import { toIso } from '@estateops/kernel';
import { maskIdNumber } from '../domain/customer.js';

const text = z.string().nullable().optional();

export const createCustomerRequest = z.object({
  full_name: z.string(),
  phone: text,
  email: text,
  id_number: text,
  city: text,
  preferred_language: z.string().optional(),
});

export const updateCustomerRequest = z
  .object({
    full_name: z.string().optional(),
    phone: text,
    email: text,
    id_number: text,
    city: text,
    preferred_language: z.string().optional(),
  })
  .strict();

export const listCustomersQuery = z.object({
  q: z.string().optional(),
  has_overdue: z.enum(['true', 'false']).optional(),
  sort: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

const MAP = {
  full_name: 'fullName',
  phone: 'phone',
  email: 'email',
  id_number: 'idNumber',
  city: 'city',
  preferred_language: 'preferredLanguage',
};
export const toCustomerFields = (body) =>
  Object.fromEntries(
    Object.entries(MAP)
      .filter(([wire]) => body[wire] !== undefined)
      .map(([wire, field]) => [field, body[wire]]),
  );

/** The ID number is only ever sent masked. */
export const toCustomerResponse = ({ customer: c, currency, allowedActions }) => ({
  id: c.id,
  tenant_id: c.tenantId,
  full_name: c.fullName,
  phone: c.phone ?? '',
  email: c.email ?? '',
  id_number_masked: maskIdNumber(c.idNumber),
  city: c.city ?? '',
  preferred_language: c.preferredLanguage,
  currency,
  bookings_count: c.bookingsCount,
  units_summary: c.unitsSummary,
  total_value: c.totalValue,
  received_amount: c.receivedAmount,
  pending_amount: c.pendingAmount,
  overdue_amount: c.overdueAmount,
  escalated_count: c.escalatedCount,
  allowed_actions: allowedActions,
  created_at: toIso(c.createdAt),
  updated_at: toIso(c.updatedAt),
});
