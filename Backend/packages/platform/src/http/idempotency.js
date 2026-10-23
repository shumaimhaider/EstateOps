import { createHash } from 'node:crypto';
import { fieldError } from '@estateops/kernel';

const hashBody = (body) =>
  createHash('sha256')
    .update(JSON.stringify(body ?? null))
    .digest('hex');
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Replays the stored response when the same `Idempotency-Key` is sent again for the same route,
 * so a retried write never repeats its effect. Only successful (2xx) responses are stored, and they are stored before the response is sent.
 * `store`: { find(tenantId, key, route), save({ tenantId, key, route, requestHash, status, body }) }.
 * Concurrent first attempts are protected by the database constraints behind each use case.
 */
export const idempotency = (store) => async (req, res, next) => {
  const header = req.get('idempotency-key');
  if (!header || !WRITES.has(req.method) || !req.auth) return next();
  if (header.length > 200) throw fieldError('Idempotency-Key', 'Key is too long');
  // a customer's keys are theirs alone: another customer of the same tenant can never replay them
  const key = req.auth.customerId ? `c:${req.auth.customerId}:${header}` : header;

  const route = `${req.method} ${req.baseUrl}${req.path}`;
  const requestHash = hashBody(req.body);
  const found = await store.find(req.auth.tenantId, key, route);
  if (found) {
    if (found.requestHash !== requestHash) {
      return res.status(422).json({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'This Idempotency-Key was used with a different request',
        details: [],
      });
    }
    res.set('Idempotent-Replay', 'true');
    return res.status(found.status).json(found.body);
  }

  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 200 || res.statusCode >= 300) return json(body);
    // Save first, then answer: a retry that arrives straight after this response must find the key.
    // A failed save (a concurrent first attempt stored it already) must not break the response.
    store
      .save({ tenantId: req.auth.tenantId, key, route, requestHash, status: res.statusCode, body })
      .catch(() => {})
      .finally(() => json(body));
    return res;
  };
  next();
};
