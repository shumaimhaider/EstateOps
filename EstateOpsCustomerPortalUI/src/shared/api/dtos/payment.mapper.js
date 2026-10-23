import { money } from '../../lib/money.js';

export const checkoutFromApi = (d) => ({
  checkoutId: d.checkout_id,
  clientSecret: d.client_secret,
  publishableKey: d.publishable_key,
  amount: d.amount === undefined ? null : money(d.amount, d.currency),
});

export const checkoutRequestToApi = ({ amountMinor, saveCard } = {}) => ({
  amount: amountMinor ?? undefined,
  save_card: saveCard || undefined,
});

export const transactionFromApi = (d) => ({
  id: d.id,
  invoiceId: d.invoice_id,
  bookingId: d.booking_id,
  trigger: d.trigger,
  amount: money(d.amount, d.currency),
  status: d.status,
  cardBrand: d.card_brand,
  cardLast4: d.card_last4,
  failureMessage: d.failure_message,
  createdAt: d.created_at,
  completedAt: d.completed_at,
});

export const checkoutStatusFromApi = (d) => ({
  checkoutId: d.checkout_id,
  purpose: d.purpose,
  status: d.status,
  transaction: d.transaction ? transactionFromApi(d.transaction) : null,
});

export const paymentMethodFromApi = (d) => ({
  id: d.id,
  brand: d.brand,
  last4: d.last4,
  expMonth: d.exp_month,
  expYear: d.exp_year,
  isActive: d.is_active,
  expired: d.expired,
  createdAt: d.created_at,
});
