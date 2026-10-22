import request from 'supertest';
import { TEST_INTERNAL_TOKEN } from './auth.js';

/** Delivers an event to a service app the way the relay would: POST /internal/events. */
export const deliverEvent = (app, event, token = TEST_INTERNAL_TOKEN) =>
  request(app).post('/internal/events').set('x-internal-token', token).send(event);

/** Event handler for the in-memory bus that posts into a service app. */
export const appSubscriber = (app) => async (event) => {
  const res = await deliverEvent(app, event);
  if (res.status >= 300) throw new Error(`Event ${event.type} failed: ${res.status} ${res.text}`);
};
