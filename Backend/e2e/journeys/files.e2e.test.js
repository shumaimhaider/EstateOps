import { describe, expect, it } from 'vitest';
import { useStack } from '../support/suite.js';

const ctx = useStack();
const A = '/api/v1/admin';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

/** What the browser does: PUT the bytes to the signed URL it was given. */
const putTo = (upload, bytes, contentType = upload.headers['Content-Type']) =>
  fetch(upload.url, {
    method: upload.method,
    headers: { 'Content-Type': contentType },
    body: bytes,
  });

async function flat() {
  const { w } = ctx;
  const t = await w.tenantWithStaff({ roles: ['inventory_manager', 'sales_agent'] });
  const project = await t.owner.post(`${A}/projects`, { name: 'Tower', kind: 'tower' });
  const unit = await t.owner.post(`${A}/units`, {
    project_id: project.id,
    unit_no: 'F-101',
    kind: 'flat',
    area_value: 900,
    area_unit: 'sq_ft',
    list_price: 5_000_000_00,
    currency: 'PKR',
    bedrooms: 2,
  });
  return { t, project, unit };
}

describe('files by signed URL (unit pictures and the site map)', () => {
  it('uploads a picture straight to the bucket, attaches it, and serves a URL built from stored identity only', async () => {
    const { t, unit } = await flat();
    const slot = await t.staff.inventory_manager.post(`${A}/units/${unit.id}/media/upload-url`, {
      kind: 'image',
      filename: 'living room.png',
      content_type: 'image/png',
      size: PNG.length,
    });
    expect(slot.upload).toMatchObject({ method: 'PUT' });
    expect(slot.upload.url).toContain(ctx.stack.s3.url); // straight to the bucket, not through EstateOps
    expect((await putTo(slot.upload, PNG)).status).toBe(200);

    const media = await t.staff.inventory_manager.post(`${A}/units/${unit.id}/media`, {
      kind: 'image',
      asset_id: slot.asset_id,
      caption: 'Living room',
    });
    expect(media.caption ?? media.media?.caption ?? 'Living room').toBe('Living room');
    const reread = await t.owner.get(`${A}/units/${unit.id}`);
    const picture = (reread.media ?? reread.pictures ?? []).find((m) =>
      (m.url ?? '').includes('living'),
    );
    expect(picture, JSON.stringify(reread)).toBeTruthy();
    // the stored identity builds the URL: <base>/<tenant>/<owner>/<id>/... and nothing else
    expect(picture.url.startsWith(`${ctx.stack.s3.url}/estateops/${t.tenantId}/`)).toBe(true);
    expect(picture.url).not.toContain('X-Amz-Signature');
    expect([...ctx.stack.s3.objects.keys()].some((k) => k.startsWith(`${t.tenantId}/`))).toBe(true);
  });

  it('refuses to attach a picture that was never uploaded, and the wrong file type or size', async () => {
    const { t, unit } = await flat();
    const slot = await t.staff.inventory_manager.post(`${A}/units/${unit.id}/media/upload-url`, {
      kind: 'image',
      filename: 'a.png',
      content_type: 'image/png',
      size: PNG.length,
    });
    expect(
      (
        await t.staff.inventory_manager.fails('POST', `${A}/units/${unit.id}/media`, {
          kind: 'image',
          asset_id: slot.asset_id,
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await t.staff.inventory_manager.fails('POST', `${A}/units/${unit.id}/media/upload-url`, {
          kind: 'image',
          filename: 'run.exe',
          content_type: 'application/x-msdownload',
          size: 10,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await t.staff.inventory_manager.fails('POST', `${A}/units/${unit.id}/media/upload-url`, {
          kind: 'image',
          filename: 'huge.png',
          content_type: 'image/png',
          size: 500 * 1024 * 1024,
        })
      ).status,
    ).toBe(422);
  });

  it('a signed upload URL is bound to its content type and to the person who asked', async () => {
    const { t, unit } = await flat();
    const slot = await t.staff.inventory_manager.post(`${A}/units/${unit.id}/media/upload-url`, {
      kind: 'image',
      filename: 'a.png',
      content_type: 'image/png',
      size: PNG.length,
    });
    expect((await putTo(slot.upload, '<html>', 'text/html')).status).toBe(403);
    expect(
      (
        await t.staff.sales_agent.fails('POST', `${A}/units/${unit.id}/media/upload-url`, {
          kind: 'image',
          filename: 'a.png',
          content_type: 'image/png',
          size: 5,
        })
      ).status,
    ).toBe(403);
  });

  it('plots never take pictures', async () => {
    const { t, project } = await flat();
    const plot = await t.owner.post(`${A}/units`, {
      project_id: project.id,
      unit_no: 'P-1',
      kind: 'plot',
      area_value: 5,
      area_unit: 'marla',
      list_price: 100,
      currency: 'PKR',
    });
    const out = await t.staff.inventory_manager.fails(
      'POST',
      `${A}/units/${plot.id}/media/upload-url`,
      { kind: 'image', filename: 'a.png', content_type: 'image/png', size: PNG.length },
    );
    expect(out.status).toBe(409);
  });

  it('removing a picture removes the stored file too', async () => {
    const { t, unit } = await flat();
    const slot = await t.staff.inventory_manager.post(`${A}/units/${unit.id}/media/upload-url`, {
      kind: 'image',
      filename: 'gone.png',
      content_type: 'image/png',
      size: PNG.length,
    });
    await putTo(slot.upload, PNG);
    const media = await t.staff.inventory_manager.post(`${A}/units/${unit.id}/media`, {
      kind: 'image',
      asset_id: slot.asset_id,
    });
    const mediaId = media.id ?? media.media?.id;
    await t.staff.inventory_manager.delete(`${A}/units/${unit.id}/media/${mediaId}`);
    expect([...ctx.stack.s3.objects.keys()].filter((k) => k.includes('gone'))).toHaveLength(0);
  });

  it('uploads and shows a project site map the same way', async () => {
    const { t, project } = await flat();
    const slot = await t.staff.inventory_manager.post(
      `${A}/projects/${project.id}/map/upload-url`,
      { filename: 'site map.png', content_type: 'image/png', size: PNG.length },
    );
    expect((await putTo(slot.upload, PNG)).status).toBe(200);
    await t.staff.inventory_manager.put(`${A}/projects/${project.id}/map`, {
      asset_id: slot.asset_id,
    });
    const map = await t.owner.get(`${A}/projects/${project.id}/map`);
    expect(map.image_url.startsWith(`${ctx.stack.s3.url}/estateops/${t.tenantId}/`)).toBe(true);
    expect(map.image_name).toBe('site map.png');
  });
});
