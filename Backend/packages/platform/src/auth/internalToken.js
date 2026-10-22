import { timingSafeEqual } from 'node:crypto';
import { UnauthenticatedError } from '@estateops/kernel';

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Guards /internal/* endpoints (event delivery, bootstrap, jobs) with the shared secret. */
export const requireInternalToken = (expected) => (req, _res, next) => {
  if (!expected || !safeEqual(req.get('x-internal-token') ?? '', expected)) {
    throw new UnauthenticatedError('INVALID_INTERNAL_TOKEN', 'Internal token is missing or wrong');
  }
  next();
};

export { safeEqual };
