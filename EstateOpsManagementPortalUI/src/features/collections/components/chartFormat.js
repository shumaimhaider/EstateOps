import { minorExponent } from '@/shared/lib/money.js';

/** Compact axis/label text such as "1.2B". Display only; charts receive minor-unit numbers. */
export function compactMoney(minor, currency, locale) {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    minor / 10 ** minorExponent(currency),
  );
}

export const CHART_COLORS = {
  series1: 'rgb(var(--chart-1))',
  series2: 'rgb(var(--chart-2))',
  grid: 'rgb(var(--chart-grid))',
  text: 'rgb(var(--color-content-muted))',
};
