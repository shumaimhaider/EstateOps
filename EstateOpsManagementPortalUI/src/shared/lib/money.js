/**
 * Money is always an integer in minor units plus a currency code. These helpers
 * only convert for display/input; they never do arithmetic on floats.
 * @typedef {{ minor: number, currency: string }} Money
 */

/** Builds a Money value (integer minor units + currency). Used by mappers. */
export const money = (minor, currency) => ({ minor, currency });

/** Number of minor-unit digits for a currency (2 for PKR/AED/USD, 0 for JPY...). */
export function minorExponent(currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits;
}

/** Display string such as "PKR 12,500,000.00". Display only. */
export function formatMoney(minor, currency, locale = 'en') {
  const exp = minorExponent(currency);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 10 ** exp);
}

/**
 * Parses user input such as "12,500,000.5" into integer minor units using string
 * arithmetic only. Returns null when the input is not a valid amount.
 * @param {string} text @param {string} currency @returns {number | null}
 */
export function parseMajorToMinor(text, currency) {
  const exp = minorExponent(currency);
  const cleaned = String(text ?? '')
    .replace(/[\s,]/g, '')
    .trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return null;
  const [, whole, fraction = ''] = match;
  if (fraction.length > exp) return null;
  const minor = Number(whole + fraction.padEnd(exp, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}
