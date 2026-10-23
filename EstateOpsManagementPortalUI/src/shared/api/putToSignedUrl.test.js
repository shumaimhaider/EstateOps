import { afterEach, describe, expect, it, vi } from 'vitest';
import { putToSignedUrl } from './putToSignedUrl.js';

const ticket = {
  method: 'PUT',
  url: 'https://s3.test/k?sig',
  headers: { 'Content-Type': 'image/png' },
};
afterEach(() => vi.unstubAllGlobals());

describe('putToSignedUrl', () => {
  it('sends the file with the signed headers and no auth header', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await putToSignedUrl(ticket, file);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://s3.test/k?sig',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: file,
      }),
    );
  });
  it('maps a refusal and a network failure to ApiError codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    await expect(putToSignedUrl(ticket, new Blob(['x']))).rejects.toMatchObject({
      code: 'UPLOAD_REFUSED',
      status: 403,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    await expect(putToSignedUrl(ticket, new Blob(['x']))).rejects.toMatchObject({
      code: 'UPLOAD_NETWORK',
    });
  });
});
