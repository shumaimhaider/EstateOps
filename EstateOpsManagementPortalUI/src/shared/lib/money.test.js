import { describe, expect, it } from 'vitest';
import { formatMoney, parseMajorToMinor } from './money.js';

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
});
