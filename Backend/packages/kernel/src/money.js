import { ValidationError } from './errors.js';

/** Money is always integer minor units plus a currency code. Never floats. */
export const money = (minor, currency) => ({ minor, currency });

export const isMinor = (value) => Number.isSafeInteger(value);

export function assertMinor(value, field, { min = 0 } = {}) {
  if (!isMinor(value) || value < min) {
    throw new ValidationError('The amount is not valid', [
      { field, message: `Must be a whole number of minor units, at least ${min}` },
    ]);
  }
  return value;
}

/**
 * `bps` basis points of `amount` (200 = 2%), rounded half up, integer arithmetic only. Uses BigInt
 * for the multiplication so a very large amount cannot lose precision before the division.
 */
export const percentOfBps = (amount, bps) =>
  Number((BigInt(amount) * BigInt(bps) + 5000n) / 10_000n);

/** Splits `total` into `count` parts; the last part takes the rounding remainder. */
export function splitEvenly(total, count) {
  const part = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? total - part * (count - 1) : part,
  );
}
