/** ISO 4217 minor-unit digits (the ones not 2). Formatting uses these, never floating-point division. */
const DIGITS = { JPY: 0, KRW: 0, VND: 0, CLP: 0, BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3 };

/** 125000 PKR -> "PKR 1,250.00" using integer arithmetic for the digits. */
export function formatAmount(minor, currency, locale = 'en') {
  const digits = DIGITS[currency] ?? 2;
  const factor = 10 ** digits;
  const whole = Math.trunc(minor / factor);
  const frac = String(Math.abs(minor % factor)).padStart(digits, '0');
  const grouped = new Intl.NumberFormat(locale).format(whole);
  return `${currency} ${grouped}${digits ? `.${frac}` : ''}`;
}
