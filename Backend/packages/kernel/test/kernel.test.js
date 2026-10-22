import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  ConflictError,
  DEFAULT_ROLE_PERMISSIONS,
  LOCKED_ROLES,
  PERMISSION_CATALOG,
  ROLES,
  RateLimitedError,
  ValidationError,
  addDays,
  isEmail,
  isNonEmptyString,
  validator,
  addMonths,
  assertMinor,
  clampLimit,
  consumeOnce,
  daysBetween,
  decodeCursor,
  defineMachine,
  encodeCursor,
  fieldError,
  fixedClock,
  isIsoDate,
  parseSort,
  percentOfBps,
  splitEvenly,
  to,
  today,
} from '../src/index.js';

describe('errors', () => {
  it('carry a kind, code and field details for the single HTTP mapper', () => {
    const e = fieldError('email', 'Required');
    expect(e).toBeInstanceOf(ValidationError);
    expect(e).toMatchObject({ kind: 'validation', code: 'VALIDATION_ERROR' });
    expect(e.details).toEqual([{ field: 'email', message: 'Required' }]);
    expect(new ConflictError('CONTRACT_OPEN', 'x')).toMatchObject({
      kind: 'conflict',
      code: 'CONTRACT_OPEN',
    });
  });
});

describe('money', () => {
  it('accepts whole minor units only', () => {
    expect(assertMinor(100, 'amount')).toBe(100);
    expect(() => assertMinor(1.5, 'amount')).toThrow(ValidationError);
    expect(() => assertMinor(-1, 'amount')).toThrow(ValidationError);
    expect(() => assertMinor(0, 'amount', { min: 1 })).toThrow(ValidationError);
  });

  it('computes basis points with integer rounding', () => {
    expect(percentOfBps(53_472_222, 200)).toBe(1_069_444);
    expect(percentOfBps(1000, 250)).toBe(25);
    expect(percentOfBps(1050, 100)).toBe(11); // half rounds up
    expect(percentOfBps(9_000_000_000_000_000, 10_000)).toBe(9_000_000_000_000_000); // no precision loss
  });

  it('splits so the last part takes the remainder and the parts add up', () => {
    const parts = splitEvenly(100, 3);
    expect(parts).toEqual([33, 33, 34]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('dates', () => {
  it('adds months with the day capped at 28', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-03-05', 0)).toBe('2026-03-05');
  });
  it('counts days and validates ISO dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-21')).toBe(20);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(isIsoDate('2026-10-21')).toBe(true);
    expect(isIsoDate('21/10/2026')).toBe(false);
    expect(today(fixedClock('2026-10-21T23:30:00Z'))).toBe('2026-10-21');
  });
});

describe('state machine', () => {
  const m = defineMachine('thing', {
    a: { go: to('b'), auto: to('c', true) },
    b: {},
    c: {},
  });
  it('moves along listed transitions and rejects the rest with 409', () => {
    expect(m.transition('a', 'go')).toBe('b');
    expect(() => m.transition('b', 'go')).toThrowError(/Cannot go a thing that is b/);
    expect(() => m.transition('b', 'go')).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });
  it('never offers system transitions to staff', () => {
    expect(m.staffActions('a')).toEqual(['go']);
    expect(m.can('a', 'auto')).toBe(true);
  });
});

describe('cursor', () => {
  it('round trips and rejects garbage', () => {
    const c = encodeCursor({ v: 5, id: 'x' });
    expect(decodeCursor(c)).toEqual({ v: 5, id: 'x' });
    expect(decodeCursor(undefined)).toBeNull();
    expect(() => decodeCursor('###')).toThrow(ValidationError);
    expect(() => decodeCursor(encodeCursor({ nope: 1 }))).toThrow(ValidationError);
  });
  it('clamps limits and checks sort fields against an allow-list', () => {
    expect(clampLimit('500')).toBe(200);
    expect(clampLimit(undefined)).toBe(25);
    expect(clampLimit(0)).toBe(25);
    expect(parseSort('amount:desc', ['amount'], null)).toEqual({ field: 'amount', dir: 'desc' });
    expect(parseSort(undefined, ['amount'], { field: 'amount', dir: 'asc' })).toEqual({
      field: 'amount',
      dir: 'asc',
    });
    expect(() => parseSort('hack:asc', ['amount'], null)).toThrow(ValidationError);
  });
});

describe('consumeOnce', () => {
  it('runs the work once per event id', async () => {
    const seen = new Set();
    const repos = {
      processedEvents: {
        markProcessed: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
      },
    };
    let runs = 0;
    const event = { id: 'e1' };
    await consumeOnce(repos, event, async () => (runs += 1));
    const again = await consumeOnce(repos, event, async () => (runs += 1));
    expect(runs).toBe(1);
    expect(again.duplicate).toBe(true);
  });
});

describe('permissions', () => {
  it('has 18 permissions, 10 roles, and locked owner and admin hold everything', () => {
    expect(PERMISSION_CATALOG).toHaveLength(18);
    expect(ROLES).toHaveLength(10);
    expect(LOCKED_ROLES).toEqual(['owner', 'admin']);
    expect(DEFAULT_ROLE_PERMISSIONS.owner).toEqual(ALL_PERMISSIONS);
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toEqual(ALL_PERMISSIONS);
  });
  it('gives every role only catalogued permissions, and finance can adjust and manage fines', () => {
    for (const role of ROLES) {
      for (const key of DEFAULT_ROLE_PERMISSIONS[role]) expect(ALL_PERMISSIONS).toContain(key);
    }
    expect(DEFAULT_ROLE_PERMISSIONS.finance).toEqual(
      expect.arrayContaining(['invoices.adjust', 'fines.manage', 'payments.card']),
    );
    expect(DEFAULT_ROLE_PERMISSIONS.sales_agent).not.toContain('payments.record');
    expect(DEFAULT_ROLE_PERMISSIONS.auditor).not.toContain('payments.record');
  });
});

describe('validator', () => {
  it('collects all problems and throws once', () => {
    const v = validator('Not saved');
    v.check(false, 'name', 'Required');
    v.check(true, 'ok', 'never');
    v.add('email', 'Bad');
    expect(v.failed).toBe(true);
    try {
      v.done();
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toBe('Not saved');
      expect(e.details).toEqual([
        { field: 'name', message: 'Required' },
        { field: 'email', message: 'Bad' },
      ]);
    }
    expect(() => validator().done()).not.toThrow();
  });
  it('checks emails and non-empty strings', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail(5)).toBe(false);
    expect(isNonEmptyString('  x ')).toBe(true);
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString('x'.repeat(201))).toBe(false);
  });
  it('has a rate limited error for lockouts', () => {
    expect(new RateLimitedError()).toMatchObject({
      kind: 'rate_limited',
      code: 'TOO_MANY_ATTEMPTS',
    });
  });
});
