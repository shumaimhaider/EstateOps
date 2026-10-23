import { describe, expect, it } from 'vitest';
import {
  checkUpload,
  createFileUrlBuilder,
  createInMemoryStorage,
  createS3Storage,
  objectKey,
  presignS3,
  safeFileName,
} from '../src/index.js';

describe('presignS3', () => {
  it('matches the AWS documentation example signature', () => {
    const { signature } = presignS3({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresIn: 86400,
      date: new Date('2013-05-24T00:00:00Z'),
    });
    expect(signature).toBe('aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  });
});

describe('object keys', () => {
  const asset = {
    tenantId: 't1',
    ownerType: 'unit',
    ownerId: 'u1',
    purpose: 'unit_image',
    id: 'a1',
    storedName: 'front.jpg',
  };
  it('builds the key and the url from columns, so only the base needs to change', () => {
    expect(objectKey(asset)).toBe('t1/unit/u1/unit_image/a1-front.jpg');
    expect(createFileUrlBuilder('https://cdn.example.com/')(asset)).toBe(
      'https://cdn.example.com/t1/unit/u1/unit_image/a1-front.jpg',
    );
    expect(createFileUrlBuilder('https://x.blob.core.windows.net/files')(asset)).toBe(
      'https://x.blob.core.windows.net/files/t1/unit/u1/unit_image/a1-front.jpg',
    );
    expect(createFileUrlBuilder('https://c')(null)).toBeNull();
  });
  it('refuses path tricks and cleans names', () => {
    expect(() => objectKey({ ...asset, ownerId: '../x' })).toThrow();
    expect(() => objectKey({ ...asset, storedName: '' })).toThrow();
    expect(safeFileName('C:\\Users\\Me\\My Flat Photo (1).JPG')).toBe('my-flat-photo-1.jpg');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('')).toBe('file');
    expect(safeFileName(`${'a'.repeat(200)}.png`).endsWith('.png')).toBe(true);
  });
});

describe('upload policy', () => {
  it('checks type and size per purpose', () => {
    expect(checkUpload('unit_image', { contentType: 'image/png', size: 100 })).toBeNull();
    expect(checkUpload('unit_image', { contentType: 'application/pdf', size: 100 })).toMatch(
      /allowed/,
    );
    expect(checkUpload('unit_image', { contentType: 'image/png', size: 9 * 1024 * 1024 })).toMatch(
      /larger/,
    );
    expect(checkUpload('unit_image', { contentType: 'image/png', size: 0 })).toMatch(/empty/);
    expect(checkUpload('nope', { contentType: 'image/png', size: 1 })).toMatch(/Unknown/);
  });
});

describe('storage adapters', () => {
  it('S3 signs path-style URLs for a custom endpoint and virtual-hosted for AWS', () => {
    const base = {
      bucket: 'b',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
      now: () => new Date('2026-01-01T00:00:00Z'),
    };
    const minio = createS3Storage({ ...base, endpoint: 'http://localhost:9000' }).signUpload(
      't/a b.png',
      { contentType: 'image/png' },
    );
    expect(minio.url).toMatch(
      /^http:\/\/localhost:9000\/b\/t\/a%20b\.png\?X-Amz-Algorithm=AWS4-HMAC-SHA256/,
    );
    expect(minio.url).toContain('X-Amz-SignedHeaders=content-type%3Bhost');
    expect(minio.headers).toEqual({ 'Content-Type': 'image/png' });
    const aws = createS3Storage({ ...base, region: 'eu-west-1' }).signDownload('k.png');
    expect(aws.url).toMatch(/^https:\/\/b\.s3\.eu-west-1\.amazonaws\.com\/k\.png\?/);
  });
  it('S3 head and remove call the signed URL', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(init.method);
      if (init.method === 'HEAD')
        return new Response(null, {
          status: url.includes('missing') ? 404 : 200,
          headers: { 'content-length': '12', 'content-type': 'image/png' },
        });
      return new Response(null, { status: 204 });
    };
    const s = createS3Storage({ bucket: 'b', accessKeyId: 'a', secretAccessKey: 's', fetchImpl });
    expect(await s.head('x.png')).toEqual({ size: 12, contentType: 'image/png' });
    expect(await s.head('missing.png')).toBeNull();
    await s.remove('x.png');
    expect(calls).toEqual(['HEAD', 'HEAD', 'DELETE']);
  });
  it('in-memory storage behaves the same', async () => {
    const s = createInMemoryStorage();
    s.put('k', { size: 3, contentType: 'image/png' });
    expect(await s.head('k')).toEqual({ size: 3, contentType: 'image/png' });
    await s.remove('k');
    expect(await s.head('k')).toBeNull();
    expect(s.signUpload('k', { contentType: 'image/png' }).method).toBe('PUT');
    expect(s.signDownload('k').method).toBe('GET');
  });
});

describe('files kit', () => {
  it('builds from config and can take a fake storage', async () => {
    const { createFilesKit } = await import('../src/index.js');
    const kit = createFilesKit({
      STORAGE_DRIVER: 'memory',
      STORAGE_PUBLIC_BASE_URL: 'https://cdn.x',
    });
    expect(
      kit.fileUrl({
        tenantId: 't',
        ownerType: 'unit',
        ownerId: 'u',
        purpose: 'p',
        id: 'i',
        storedName: 'n.png',
      }),
    ).toBe('https://cdn.x/t/unit/u/p/i-n.png');
    const s3 = createFilesKit({
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'b',
      S3_REGION: 'r',
      S3_ACCESS_KEY_ID: 'a',
      S3_SECRET_ACCESS_KEY: 's',
      STORAGE_PUBLIC_BASE_URL: 'https://c',
    });
    expect(s3.storage.signDownload('k').url).toContain('b.s3.r.amazonaws.com');
    const fake = createInMemoryStorage();
    expect(
      createFilesKit({ STORAGE_PUBLIC_BASE_URL: 'https://c' }, { storage: fake }).storage,
    ).toBe(fake);
  });
});
