import { EVENT } from './events.js';

/** The services that exist. Used for event routing and for gateway route checks. */
export const SERVICES = Object.freeze([
  'identity',
  'inventory',
  'customer',
  'sales',
  'billing',
  'contract',
]);

/**
 * Who produces each event and who consumes it. The relay delivers an event only to its consumers,
 * so adding a consumer is a change here and in that service's handler map.
 */
export const EVENT_ROUTES = Object.freeze({
  [EVENT.TENANT_UPSERTED]: {
    producer: 'identity',
    consumers: ['inventory', 'customer', 'billing'],
  },
  [EVENT.PROJECT_UPSERTED]: { producer: 'inventory', consumers: ['billing'] },
  [EVENT.UNIT_UPSERTED]: { producer: 'inventory', consumers: ['sales', 'billing'] },
  [EVENT.CUSTOMER_UPSERTED]: { producer: 'customer', consumers: ['sales', 'billing'] },
  [EVENT.BOOKING_REQUESTED]: { producer: 'sales', consumers: ['inventory'] },
  [EVENT.UNIT_BOOKED]: { producer: 'inventory', consumers: ['sales'] },
  [EVENT.UNIT_BOOKING_REJECTED]: { producer: 'inventory', consumers: ['sales'] },
  [EVENT.BOOKING_CONFIRMED]: { producer: 'sales', consumers: ['billing', 'contract'] },
  [EVENT.SCHEDULE_CREATED]: { producer: 'billing', consumers: ['sales'] },
  [EVENT.BOOKING_SUMMARY_CHANGED]: { producer: 'billing', consumers: ['sales', 'customer'] },
  [EVENT.BOOKING_FULLY_PAID]: { producer: 'billing', consumers: ['sales'] },
  [EVENT.BOOKING_COMPLETED]: { producer: 'sales', consumers: ['inventory'] },
  [EVENT.BOOKING_CANCELLED]: {
    producer: 'sales',
    consumers: ['inventory', 'billing', 'contract', 'customer'],
  },
  [EVENT.PAYMENT_RECORDED]: { producer: 'billing', consumers: [] },
  [EVENT.FINE_RATE_CHANGED]: { producer: 'billing', consumers: ['billing'] },
  [EVENT.CONTRACT_STATUS_CHANGED]: { producer: 'contract', consumers: [] },
});

export const consumersOf = (type) => EVENT_ROUTES[type]?.consumers ?? [];
