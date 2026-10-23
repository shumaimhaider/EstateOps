import { createHash, createHmac } from 'node:crypto';
import express from 'express';

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const sha = (data) => createHash('sha256').update(data).digest('hex');
const enc = (s) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * A stand-in for an S3-compatible bucket (path-style, like MinIO): PUT, GET, HEAD and DELETE of
 * objects behind AWS Signature V4 *presigned URLs*. The signature is checked the way S3 checks it
 * (rebuilt from the request that arrived, independently of the code that signed it), and expiry is
 * enforced, so a broken signer or a reused expired URL fails here as it would in production.
 */
export function createMockS3({
  bucket = 'estateops',
  region = 'us-east-1',
  accessKeyId = 'mock-access-key',
  secretAccessKey = 'mock-secret-key',
  now = () => Date.now(),
} = {}) {
  const objects = new Map();
  const app = express();
  app.disable('x-powered-by');

  const deny = (res, status, code, message) =>
    res
      .status(status)
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`,
      );

  // the full path as sent (inside app.use, req.path has the mount point cut off)
  const pathOf = (req) => new URL(req.originalUrl, 'http://s3.mock').pathname;
  // a browser uploads straight to the bucket from another origin, so the bucket must allow it (as a CORS rule does on S3)
  app.use((req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, HEAD, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': 'ETag, Content-Length, Content-Type',
    });
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });

  const keyOf = (req) => decodeURIComponent(pathOf(req).slice(`/${bucket}/`.length));

  function check(req) {
    const q = req.query;
    if (q['X-Amz-Algorithm'] !== 'AWS4-HMAC-SHA256')
      return ['AuthorizationQueryParametersError', 'Unsupported algorithm', 400];
    const [key, day, reg, service, term] = String(q['X-Amz-Credential'] ?? '').split('/');
    if (key !== accessKeyId)
      return ['InvalidAccessKeyId', 'The AWS Access Key Id you provided does not exist', 403];
    if (reg !== region || service !== 's3' || term !== 'aws4_request')
      return ['AuthorizationQueryParametersError', 'Bad credential scope', 400];
    const amz = String(q['X-Amz-Date'] ?? '');
    const issued = Date.parse(
      amz.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'),
    );
    const expires = Number(q['X-Amz-Expires']);
    if (!Number.isFinite(issued) || !(expires > 0 && expires <= 604_800))
      return ['AuthorizationQueryParametersError', 'Bad date or expiry', 400];
    if (now() > issued + expires * 1000) return ['AccessDenied', 'Request has expired', 403];
    if (now() < issued - 15 * 60_000)
      return [
        'RequestTimeTooSkewed',
        'The difference between the request time and the server time is too large',
        403,
      ];
    const names = String(q['X-Amz-SignedHeaders'] ?? '').split(';');
    const headers = names.map(
      (n) => `${n}:${String(n === 'host' ? req.get('host') : (req.get(n) ?? '')).trim()}`,
    );
    const canonicalQuery = Object.keys(q)
      .filter((k) => k !== 'X-Amz-Signature')
      .sort()
      .map((k) => `${enc(k)}=${enc(String(q[k]))}`)
      .join('&');
    const canonicalPath = pathOf(req)
      .split('/')
      .map((seg) => enc(decodeURIComponent(seg)))
      .join('/');
    const canonical = [
      req.method,
      canonicalPath,
      canonicalQuery,
      ...headers,
      '',
      names.join(';'),
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const scope = `${day}/${reg}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canonical)].join('\n');
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), reg), 's3'),
      'aws4_request',
    );
    const expected = createHmac('sha256', signingKey).update(toSign).digest('hex');
    return expected === q['X-Amz-Signature']
      ? null
      : [
          'SignatureDoesNotMatch',
          'The request signature we calculated does not match the signature you provided',
          403,
        ];
  }

  app.use(`/${bucket}/`, express.raw({ type: () => true, limit: '25mb' }), (req, res) => {
    const problem = check(req);
    if (problem) return deny(res, problem[2], problem[0], problem[1]);
    const key = keyOf(req);
    if (req.method === 'PUT') {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      objects.set(key, {
        body,
        contentType: req.get('content-type') ?? 'application/octet-stream',
        at: now(),
      });
      return res
        .status(200)
        .set('ETag', `"${sha(body).slice(0, 32)}"`)
        .end();
    }
    const object = objects.get(key);
    if (!object)
      return req.method === 'HEAD'
        ? res.status(404).end()
        : deny(res, 404, 'NoSuchKey', 'The specified key does not exist.');
    if (req.method === 'DELETE') {
      objects.delete(key);
      return res.status(204).end();
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      res
        .status(200)
        .set({ 'Content-Type': object.contentType, 'Content-Length': String(object.body.length) });
      return req.method === 'HEAD' ? res.end() : res.end(object.body);
    }
    return deny(
      res,
      405,
      'MethodNotAllowed',
      'The specified method is not allowed against this resource.',
    );
  });

  const control = express.Router();
  control.get('/objects', (_req, res) =>
    res.json(
      [...objects].map(([key, o]) => ({ key, size: o.body.length, contentType: o.contentType })),
    ),
  );
  control.post('/reset', (_req, res) => {
    objects.clear();
    res.json({ ok: true });
  });
  app.use('/_mock', control);
  app.use((_req, res) => deny(res, 404, 'NoSuchBucket', 'The specified bucket does not exist'));

  return { app, objects, bucket, region, accessKeyId, secretAccessKey };
}
