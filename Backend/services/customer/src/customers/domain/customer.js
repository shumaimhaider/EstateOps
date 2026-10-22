import { isEmail, isNonEmptyString, newId, validator } from '@estateops/kernel';

export const LANGUAGES = Object.freeze(['en', 'ur', 'ar']);
const PHONE = /^\+?[0-9][0-9 ()-]{5,24}$/;
const ID_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 -]{3,39}$/;

/** ID numbers are always shown masked: every digit but the last becomes a star. */
export const maskIdNumber = (id) => (id ? id.replace(/\d(?=(?:\D*\d){1})/g, '*') : '');

function check(f) {
  const v = validator('The customer could not be saved');
  if (f.fullName !== undefined)
    v.check(isNonEmptyString(f.fullName, 120), 'full_name', 'Name is required');
  if (f.phone !== undefined && f.phone !== null && f.phone !== '')
    v.check(PHONE.test(f.phone), 'phone', 'Enter a valid phone number');
  if (f.email !== undefined && f.email !== null && f.email !== '')
    v.check(isEmail(f.email.trim().toLowerCase()), 'email', 'Enter a valid email address');
  if (f.idNumber !== undefined && f.idNumber !== null && f.idNumber !== '')
    v.check(ID_NUMBER.test(f.idNumber), 'id_number', 'Enter a valid ID number');
  if (f.city !== undefined && f.city !== null)
    v.check(typeof f.city === 'string' && f.city.length <= 80, 'city', 'City is too long');
  if (f.preferredLanguage !== undefined)
    v.check(
      LANGUAGES.includes(f.preferredLanguage),
      'preferred_language',
      'Choose English, Urdu or Arabic',
    );
  v.done();
}

const clean = (value) =>
  value === undefined || value === null || value === '' ? null : String(value).trim();

export function createCustomer(
  { tenantId, fullName, phone, email, idNumber, city, preferredLanguage = 'en' },
  { id = newId() } = {},
) {
  check({ fullName: fullName ?? '', phone, email, idNumber, city, preferredLanguage });
  return {
    id,
    tenantId,
    fullName: fullName.trim(),
    phone: clean(phone),
    email: clean(email)?.toLowerCase() ?? null,
    idNumber: clean(idNumber),
    city: clean(city),
    preferredLanguage,
    // money position: always a sum over the customer's bookings, maintained from billing events
    bookingsCount: 0,
    totalValue: 0,
    receivedAmount: 0,
    pendingAmount: 0,
    overdueAmount: 0,
    escalatedCount: 0,
    unitsSummary: [],
    version: 1,
  };
}

export function updateCustomer(customer, patch) {
  check(patch);
  const has = (k) => patch[k] !== undefined;
  return {
    ...customer,
    fullName: has('fullName') ? patch.fullName.trim() : customer.fullName,
    phone: has('phone') ? clean(patch.phone) : customer.phone,
    email: has('email') ? (clean(patch.email)?.toLowerCase() ?? null) : customer.email,
    idNumber: has('idNumber') ? clean(patch.idNumber) : customer.idNumber,
    city: has('city') ? clean(patch.city) : customer.city,
    preferredLanguage: patch.preferredLanguage ?? customer.preferredLanguage,
  };
}

export const hasBookings = (customer) => customer.bookingsCount > 0;
