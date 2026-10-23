import { describe, expect, it } from 'vitest';
import { formatMoney, minorExponent, minorToMajorInput, parseMajorToMinor } from './money.js';

describe('money', () => {
  it('parses user input to integer minor units without float math', () => {
    expect(parseMajorToMinor('12,500,000', 'PKR')).toBe(1250000000);
    expect(parseMajorToMinor('0.1', 'AED')).toBe(10);
    expect(parseMajorToMinor('19.99', 'AED')).toBe(1999);
    expect(parseMajorToMinor('1.005', 'AED')).toBeNull();
    expect(parseMajorToMinor('abc', 'AED')).toBeNull();
    expect(parseMajorToMinor('', 'AED')).toBeNull();
  });

  it('formats minor units for display', () => {
    expect(formatMoney(1999, 'AED', 'en')).toContain('19.99');
  });

  it('uses the ISO minor-unit digits on every platform (PKR has 2, not the 0 some browsers report)', () => {
    expect(minorExponent('PKR')).toBe(2);
    expect(minorExponent('AED')).toBe(2);
    expect(minorExponent('JPY')).toBe(0);
    expect(minorExponent('KWD')).toBe(3);
    expect(formatMoney(60_000_000_00, 'PKR', 'en-PK')).toMatch(/60,000,000\.00/);
    expect(formatMoney(1500, 'JPY', 'en')).toMatch(/1,500$/);
    expect(parseMajorToMinor('30000', 'PKR')).toBe(3_000_000);
    expect(minorToMajorInput(3_000_000, 'PKR')).toBe('30000.00');
  });
});
