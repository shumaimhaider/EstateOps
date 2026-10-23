import { money } from '../../lib/money.js';

/** @typedef {import('../../../features/payments/domain/payment.model.js').Transaction} Transaction */

export const checkoutFromApi = (dto) => ({
  checkoutId: dto.checkout_id,
  clientSecret: dto.client_secret,
  publishableKey: dto.publishable_key,
  amount: dto.amount === undefined ? null : money(dto.amount, dto.currency),
});

/** Form values -> the checkout request: part amount and/or an adjusted invoice amount. */
export const checkoutRequestToApi = (payment, { saveCard = false } = {}) => ({
  amount: payment.amountMinor ?? undefined,
  ...(payment.adjustedAmountMinor == null
    ? {}
    : {
        adjusted_amount: payment.adjustedAmountMinor,
        adjustment_reason: payment.adjustmentReason || undefined,
      }),
  save_card: saveCard || undefined,
});

export const checkoutStatusFromApi = (dto) => ({
  checkoutId: dto.checkout_id,
  purpose: dto.purpose,
  status: dto.status,
  transaction: dto.transaction ? transactionFromApi(dto.transaction) : null,
});

/** @returns {Transaction} */
export const transactionFromApi = (dto) => ({
  id: dto.id,
  invoiceId: dto.installment_id,
  bookingId: dto.booking_id,
  customerId: dto.customer_id,
  trigger: dto.trigger,
  amount: money(dto.amount, dto.currency),
  status: dto.status,
  cardBrand: dto.card_brand,
  cardLast4: dto.card_last4,
  paymentIntentId: dto.stripe_payment_intent_id,
  chargeId: dto.stripe_charge_id,
  refundId: dto.stripe_refund_id,
  failureCode: dto.failure_code,
  failureMessage: dto.failure_message,
  paymentId: dto.payment_id,
  createdByName: dto.created_by_name,
  createdAt: dto.created_at,
  completedAt: dto.completed_at,
});

export const transactionDetailFromApi = (dto) => ({
  ...transactionFromApi(dto),
  stripeResponse: dto.stripe_response ?? null,
});

export const paymentMethodFromApi = (dto) => ({
  id: dto.id,
  customerId: dto.customer_id,
  brand: dto.brand,
  last4: dto.last4,
  expMonth: dto.exp_month,
  expYear: dto.exp_year,
  isActive: dto.is_active,
  expired: dto.expired,
  addedByName: dto.added_by_name,
  addedVia: dto.added_via,
  createdAt: dto.created_at,
});

export const transactionFiltersToApi = (f = {}) => ({
  installment_id: f.invoiceId || undefined,
  customer_id: f.customerId || undefined,
  booking_id: f.bookingId || undefined,
  status: f.status || undefined,
});
