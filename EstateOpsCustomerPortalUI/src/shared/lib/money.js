/**
 * Money is always an integer in minor units plus a currency code. These helpers
 * only convert for display/input; they never do arithmetic on floats.
 * @typedef {{ minor: number, currency: string }} Money
 */

/** Builds a Money value (integer minor units + currency). Used by mappers. */
export const money = (minor, currency) => ({ minor, currency });

/**
 * Minor-unit digits per ISO 4217, the same table the back end uses: 2 unless listed. This is NOT
 * read from Intl: browsers and Node disagree (some give PKR 0 digits), which would show every
 * amount 100 times too large.
 */
const DIGITS = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  UGX: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  PYG: 0,
  RWF: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
  IQD: 3,
  LYD: 3,
};

/** Number of minor-unit digits for a currency (2 for PKR/AED/USD, 0 for JPY...). */
export const minorExponent = (currency) => DIGITS[String(currency).toUpperCase()] ?? 2;

/** Display string such as "PKR 12,500,000.00". Display only. */
export function formatMoney(minor, currency, locale = 'en') {
  const exp = minorExponent(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).format(minor / 10 ** exp);
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

/** Plain-number string for an amount input (no grouping), e.g. 1250000.50 */
export function minorToMajorInput(minor, currency) {
  const exp = minorExponent(currency);
  const s = String(minor).padStart(exp + 1, '0');
  const whole = s.slice(0, s.length - exp);
  return exp === 0 ? whole : `${whole}.${s.slice(s.length - exp)}`;
}
