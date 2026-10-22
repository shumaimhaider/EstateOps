import { ValidationError } from './errors.js';

/**
 * Collects every field problem, then throws once, so a form sees all of its errors together.
 *   const v = validator('The tenant could not be saved');
 *   v.check(name.length > 0, 'name', 'Name is required');
 *   v.done();
 */
export function validator(summary = 'The request is not valid') {
  const details = [];
  return {
    check(ok, field, message) {
      if (!ok) details.push({ field, message });
      return ok;
    },
    add: (field, message) => void details.push({ field, message }),
    get failed() {
      return details.length > 0;
    },
    done() {
      if (details.length > 0) throw new ValidationError(summary, details);
    },
  };
}

export const isNonEmptyString = (value, max = 200) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
export const isEmail = (value) =>
  typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
