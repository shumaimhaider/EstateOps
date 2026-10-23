/**
 * The emails customers get about card charges. Pure: data in, { subject, text, html } out.
 * `amount` is formatted by the caller with the tenant's locale.
 */
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

const card = (d) =>
  d.cardLast4 ? `${d.cardBrand ?? 'card'} ending ${d.cardLast4}` : 'your saved card';

const frame = (title, lines, footer) => ({
  text: `${lines.join('\n\n')}\n\n${footer}`,
  html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#111">
<h2 style="font-size:18px">${esc(title)}</h2>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
<p style="color:#666;font-size:12px">${esc(footer)}</p></body></html>`,
});

const FOOTER =
  'This is an automatic message about your property payments. Please do not reply to it.';

export function chargeSucceededEmail(d) {
  const subject = `Payment received for invoice ${d.invoiceNo}`;
  const lines = [
    `Hello ${d.customerName},`,
    `We charged ${d.amount} to ${card(d)} for invoice ${d.invoiceNo} (unit ${d.unitNo}). Thank you.`,
    ...(d.receiptNo ? [`Your receipt number is ${d.receiptNo}.`] : []),
  ];
  return { subject, ...frame(subject, lines, FOOTER) };
}

export function chargeFailedEmail(d) {
  const subject = `We could not charge your card for invoice ${d.invoiceNo}`;
  const lines = [
    `Hello ${d.customerName},`,
    `We tried to charge ${d.amount} to ${card(d)} for invoice ${d.invoiceNo} (unit ${d.unitNo}), but it did not go through: ${d.failureMessage}`,
    d.willRetry
      ? `We will try again on ${d.retryOn}. You can also pay now, or add or switch the card on file, in your customer portal.`
      : 'We will not try this card again automatically. Please add or switch the card on file, or pay the invoice in your customer portal.',
  ];
  return { subject, ...frame(subject, lines, FOOTER) };
}

export function refundedEmail(d) {
  const subject = `Your card payment for invoice ${d.invoiceNo} was refunded`;
  const lines = [
    `Hello ${d.customerName},`,
    `We refunded ${d.amount} to ${card(d)}. The invoice ${d.invoiceNo} (unit ${d.unitNo}) changed while your payment was being processed, so it was returned in full. Nothing else was charged.`,
    'The refund usually appears on your statement within 5 to 10 business days.',
  ];
  return { subject, ...frame(subject, lines, FOOTER) };
}
