import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mockServer.js';
import { authFetch, configureAuthLink, tokenStore } from './authLink.js';
import { httpClient } from './httpClient.js';

describe('authLink', () => {
  it('sends the bearer token and refreshes once on 401 with a single flight', async () => {
    tokenStore.set('expired', 'refresh-1');
    let refreshCalls = 0;
    configureAuthLink({
      refresh: async () => {
        refreshCalls += 1;
        return { access: 'fresh', refresh: 'refresh-2' };
      },
    });
    server.use(
      http.get('http://localhost/probe', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer fresh'
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json({}, { status: 401 }),
      ),
    );
    const responses = await Promise.all([
      authFetch('http://localhost/probe'),
      authFetch('http://localhost/probe'),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(refreshCalls).toBe(1);
    expect(tokenStore.getAccess()).toBe('fresh');
    configureAuthLink({});
  });

  it('turns REST errors into ApiError with field errors, and sends Idempotency-Key on writes', async () => {
    let key;
    server.use(
      http.post('http://localhost/api/v1/thing', ({ request }) => {
        key = request.headers.get('Idempotency-Key');
        return HttpResponse.json(
          {
            code: 'VALIDATION_ERROR',
            message: 'bad',
            details: [{ field: 'name', message: 'taken' }],
          },
          { status: 422 },
        );
      }),
    );
    await expect(httpClient.post('/thing', { a: 1 })).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'VALIDATION_ERROR',
      fieldErrors: { name: 'taken' },
    });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });
});
