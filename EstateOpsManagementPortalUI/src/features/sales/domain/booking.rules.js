/** Share of the plan's installments that are paid, 0-100. */
export function paidPercent(booking) {
  const { total, paid } = booking.installments;
  return total === 0 ? 0 : (paid / total) * 100;
}

/** Share of the sale value received, 0-100 (integer minor units compared, no money math). */
export function receivedPercent(booking) {
  return booking.totalPrice.minor === 0
    ? 0
    : (booking.received.minor / booking.totalPrice.minor) * 100;
}
