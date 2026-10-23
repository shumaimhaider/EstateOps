import { describe, expect, it, vi } from 'vitest';
import { createMediaRepository } from './media.repository.js';

const ticket = {
  asset_id: 'a-1',
  upload: {
    method: 'PUT',
    url: 'https://s3.test/k?sig',
    headers: { 'Content-Type': 'image/png' },
    expires_in: 900,
  },
};
const file = new File(['abc'], 'Front View.png', { type: 'image/png' });

describe('media repository', () => {
  it('asks for a signed URL, uploads the file, then attaches it', async () => {
    const calls = [];
    const transport = {
      unitUploadUrl: vi.fn(async () => (calls.push('url'), ticket)),
      addUnitMedia: vi.fn(
        async () => (
          calls.push('attach'),
          {
            id: 'm-1',
            kind: 'image',
            url: 'https://cdn/x.png',
            caption: 'Hall',
            file_name: 'Front View.png',
          }
        ),
      ),
    };
    const upload = vi.fn(async () => void calls.push('put'));
    const repo = createMediaRepository({ transport, upload });
    const media = await repo.addUnitPicture(
      'u-1',
      { file, kind: 'image', caption: 'Hall' },
      { idempotencyKey: 'k' },
    );
    expect(calls).toEqual(['url', 'put', 'attach']);
    expect(transport.unitUploadUrl).toHaveBeenCalledWith(
      'u-1',
      { kind: 'image', filename: 'Front View.png', content_type: 'image/png', size: 3 },
      { idempotencyKey: 'k' },
    );
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'a-1', method: 'PUT', url: 'https://s3.test/k?sig' }),
      file,
      { signal: undefined },
    );
    expect(transport.addUnitMedia).toHaveBeenCalledWith(
      'u-1',
      { kind: 'image', asset_id: 'a-1', caption: 'Hall' },
      { idempotencyKey: 'k:attach' },
    );
    expect(media).toEqual({
      id: 'm-1',
      kind: 'image',
      url: 'https://cdn/x.png',
      caption: 'Hall',
      fileName: 'Front View.png',
    });
  });

  it('does not attach when the upload fails', async () => {
    const transport = { unitUploadUrl: async () => ticket, addUnitMedia: vi.fn() };
    const repo = createMediaRepository({
      transport,
      upload: async () => {
        throw new Error('refused');
      },
    });
    await expect(repo.addUnitPicture('u-1', { file })).rejects.toThrow('refused');
    expect(transport.addUnitMedia).not.toHaveBeenCalled();
  });

  it('rejects a malformed ticket as contract drift', async () => {
    const repo = createMediaRepository({
      transport: { unitUploadUrl: async () => ({ asset_id: 1 }) },
      upload: vi.fn(),
    });
    await expect(repo.addUnitPicture('u-1', { file })).rejects.toMatchObject({
      code: 'CONTRACT_ERROR',
    });
  });

  it('removes a picture', async () => {
    const transport = { removeUnitMedia: vi.fn(async () => null) };
    await createMediaRepository({ transport }).removeUnitPicture('u-1', 'm-1', {
      idempotencyKey: 'k',
    });
    expect(transport.removeUnitMedia).toHaveBeenCalledWith('u-1', 'm-1', { idempotencyKey: 'k' });
  });

  it('uploads a project map and returns the refreshed map', async () => {
    const map = {
      project_id: '11111111-1111-4111-8111-111111111111',
      project_name: 'P',
      width: 10,
      height: 10,
      image_url: 'https://cdn/m.png',
      image_name: 'm.png',
      blocks: [],
      shapes: [],
    };
    const transport = {
      mapUploadUrl: vi.fn(async () => ticket),
      confirmMap: vi.fn(async () => map),
    };
    const upload = vi.fn();
    const result = await createMediaRepository({ transport, upload }).uploadProjectMap(
      'p-1',
      { file },
      { idempotencyKey: 'k' },
    );
    expect(transport.confirmMap).toHaveBeenCalledWith(
      'p-1',
      { asset_id: 'a-1' },
      { idempotencyKey: 'k:confirm' },
    );
    expect(result).toMatchObject({ imageUrl: 'https://cdn/m.png', imageName: 'm.png' });
  });
});
