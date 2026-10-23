/**
 * Asks billing, the authority on money, whether a booking has had any payment. Used right before a
 * cancellation so the answer does not depend on how fast billing's events have reached sales.
 */
export function createBillingPaymentsClient({
  baseUrl,
  internalToken,
  fetchImpl = fetch,
  timeoutMs = 3000,
}) {
  return {
    async hasPayments({ tenantId, bookingId }) {
      const url = new URL(
        `/internal/bookings/${encodeURIComponent(bookingId)}/has-payments`,
        baseUrl,
      );
      url.searchParams.set('tenant_id', tenantId);
      const res = await fetchImpl(url, {
        headers: { 'x-internal-token': internalToken },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Billing answered ${res.status}`);
      return Boolean((await res.json()).has_payments);
    },
  };
}
