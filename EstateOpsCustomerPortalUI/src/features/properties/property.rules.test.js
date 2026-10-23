import { describe, expect, it } from 'vitest';
import { attention, nextToPay, paidPercent, portfolio } from './domain/property.rules.js';

const money = (minor) => ({ minor, currency: 'PKR' });
const property = (over) => ({
  total: money(1000),
  received: money(250),
  pending: money(750),
  overdue: money(0),
  nextDueDate: null,
  currency: 'PKR',
  installments: { total: 4, paid: 1, due: 0, overdue: 0, upcoming: 3 },
  ...over,
});

describe('property rules', () => {
  it('computes the paid share with integers and never above 100', () => {
    expect(paidPercent(property())).toBe(25);
    expect(paidPercent(property({ received: money(2000) }))).toBe(100);
    expect(paidPercent(property({ total: money(0) }))).toBe(0);
  });

  it('puts overdue before due, and complete when everything is paid', () => {
    expect(
      attention(property({ installments: { total: 4, paid: 1, due: 1, overdue: 1, upcoming: 1 } })),
    ).toBe('overdue');
    expect(
      attention(property({ installments: { total: 4, paid: 1, due: 1, overdue: 0, upcoming: 2 } })),
    ).toBe('due');
    expect(
      attention(property({ installments: { total: 4, paid: 4, due: 0, overdue: 0, upcoming: 0 } })),
    ).toBe('complete');
    expect(attention(property())).toBe('ontrack');
  });

  it('sums the portfolio and finds the earliest due date', () => {
    const p = portfolio([
      property({ nextDueDate: '2026-12-01' }),
      property({ nextDueDate: '2026-11-05', overdue: money(50) }),
    ]);
    expect(p).toMatchObject({
      count: 2,
      total: 2000,
      received: 500,
      pending: 1500,
      overdue: 50,
      nextDue: '2026-11-05',
      currency: 'PKR',
    });
  });

  it('picks the overdue invoice first, then the earliest due one', () => {
    const inv = (id, status, dueDate) => ({
      id,
      status,
      dueDate,
      payable: true,
      balance: money(10),
    });
    expect(
      nextToPay([
        inv('b', 'scheduled', '2026-12-01'),
        inv('a', 'overdue', '2026-10-01'),
        inv('c', 'due', '2026-11-01'),
      ]).id,
    ).toBe('a');
  });
});
