import express from 'express';
import { actorFrom, pageResponse } from '@estateops/platform';
import {
  createMediaRequest,
  createUnitRequest,
  listUnitsQuery,
  toMediaResponse,
  toUploadResponse,
  uploadUrlRequest,
  toPlacement,
  toUnitFields,
  toUnitResponse,
  updateUnitRequest,
} from './unit.dto.js';

const ACTIONS = ['block', 'unblock', 'hold', 'release'];

export function createUnitRoutes(uc, { fileUrl }) {
  const router = express.Router();

  /** Re-reads a unit with names, history and pictures: the response after every write. */
  const detail = async (req, id) =>
    toUnitResponse({ ...(await uc.getUnit.execute({ actor: actorFrom(req), id })), fileUrl });

  router.get('/units', async (req, res) => {
    const { project_id: projectId, ...rest } = listUnitsQuery.parse(req.query);
    res.json(
      pageResponse(
        await uc.listUnits.execute({ actor: actorFrom(req), projectId, ...rest }),
        toUnitResponse,
      ),
    );
  });
  router.post('/units', async (req, res) => {
    const body = createUnitRequest.parse(req.body);
    const unit = await uc.createUnit.execute({
      actor: actorFrom(req),
      projectId: body.project_id,
      fields: toUnitFields(body),
      placement: toPlacement(body),
    });
    res.status(201).json(await detail(req, unit.id));
  });
  router.get('/units/:id', async (req, res) => {
    const view = await uc.getUnit.execute({ actor: actorFrom(req), id: req.params.id });
    res.json(toUnitResponse({ ...view, fileUrl }));
  });
  router.patch('/units/:id', async (req, res) => {
    const body = updateUnitRequest.parse(req.body);
    await uc.updateUnit.execute({
      actor: actorFrom(req),
      id: req.params.id,
      fields: toUnitFields(body),
    });
    res.json(await detail(req, req.params.id));
  });
  router.delete('/units/:id', async (req, res) => {
    await uc.deleteUnit.execute({ actor: actorFrom(req), id: req.params.id });
    res.status(204).end();
  });
  for (const action of ACTIONS) {
    router.post(`/units/:id/${action}`, async (req, res) => {
      await uc.actOnUnit.execute({ actor: actorFrom(req), id: req.params.id, action });
      res.json(await detail(req, req.params.id));
    });
  }
  router.post('/units/:id/media/upload-url', async (req, res) => {
    const body = uploadUrlRequest.parse(req.body);
    res.status(201).json(
      toUploadResponse(
        await uc.requestUnitMediaUpload.execute({
          actor: actorFrom(req),
          unitId: req.params.id,
          kind: body.kind ?? 'image',
          filename: body.filename,
          contentType: body.content_type,
          size: body.size,
        }),
      ),
    );
  });
  router.post('/units/:id/media', async (req, res) => {
    const body = createMediaRequest.parse(req.body);
    res.status(201).json(
      toMediaResponse(
        await uc.addUnitMedia.execute({
          actor: actorFrom(req),
          unitId: req.params.id,
          kind: body.kind,
          assetId: body.asset_id,
          caption: body.caption,
        }),
        fileUrl,
      ),
    );
  });
  router.delete('/units/:id/media/:mediaId', async (req, res) => {
    await uc.removeUnitMedia.execute({
      actor: actorFrom(req),
      unitId: req.params.id,
      mediaId: req.params.mediaId,
    });
    res.status(204).end();
  });
  return router;
}
