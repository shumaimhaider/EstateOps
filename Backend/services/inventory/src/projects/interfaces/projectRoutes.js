import express from 'express';
import { actorFrom, pageResponse } from '@estateops/platform';
import {
  confirmMapRequest,
  createProjectRequest,
  listQuery,
  toBareProjectResponse,
  toMapResponse,
  toProjectResponse,
  updateProjectRequest,
  uploadUrlRequest,
} from './project.dto.js';
import {
  createBlockRequest,
  createPhaseRequest,
  toBlockResponse,
  toPhaseResponse,
  toStructureResponse,
} from '../../structure/interfaces/structure.dto.js';

export function createProjectRoutes(uc, { fileUrl }) {
  const router = express.Router();
  const actor = actorFrom;

  router.get('/projects', async (req, res) => {
    res.json(
      pageResponse(
        await uc.listProjects.execute({ actor: actor(req), ...listQuery.parse(req.query) }),
        toProjectResponse,
      ),
    );
  });
  router.post('/projects', async (req, res) => {
    const body = createProjectRequest.parse(req.body);
    res
      .status(201)
      .json(toBareProjectResponse(await uc.createProject.execute({ actor: actor(req), ...body })));
  });
  router.get('/projects/:id', async (req, res) => {
    res.json(
      toProjectResponse(await uc.getProject.execute({ actor: actor(req), id: req.params.id })),
    );
  });
  router.patch('/projects/:id', async (req, res) => {
    const patch = updateProjectRequest.parse(req.body);
    await uc.updateProject.execute({ actor: actor(req), id: req.params.id, patch });
    res.json(
      toProjectResponse(await uc.getProject.execute({ actor: actor(req), id: req.params.id })),
    );
  });
  router.delete('/projects/:id', async (req, res) => {
    await uc.deleteProject.execute({ actor: actor(req), id: req.params.id });
    res.status(204).end();
  });
  router.get('/projects/:id/map', async (req, res) => {
    res.json(
      toMapResponse(
        await uc.getProjectMap.execute({ actor: actor(req), id: req.params.id }),
        fileUrl,
      ),
    );
  });
  router.post('/projects/:id/map/upload-url', async (req, res) => {
    const body = uploadUrlRequest.parse(req.body);
    const issued = await uc.requestProjectMapUpload.execute({
      actor: actor(req),
      projectId: req.params.id,
      filename: body.filename,
      contentType: body.content_type,
      size: body.size,
    });
    res.status(201).json({
      asset_id: issued.assetId,
      upload: {
        method: issued.upload.method,
        url: issued.upload.url,
        headers: issued.upload.headers,
        expires_in: issued.upload.expiresIn,
      },
    });
  });
  router.put('/projects/:id/map', async (req, res) => {
    const { asset_id: assetId } = confirmMapRequest.parse(req.body);
    await uc.confirmProjectMap.execute({ actor: actor(req), projectId: req.params.id, assetId });
    res.json(
      toMapResponse(
        await uc.getProjectMap.execute({ actor: actor(req), id: req.params.id }),
        fileUrl,
      ),
    );
  });
  router.get('/projects/:id/structure', async (req, res) => {
    res.json(
      toStructureResponse(
        await uc.getProjectStructure.execute({ actor: actor(req), projectId: req.params.id }),
      ),
    );
  });
  router.post('/projects/:id/layout', async (req, res) => {
    res.json(await uc.layoutProject.execute({ actor: actor(req), id: req.params.id }));
  });
  router.post('/projects/:id/phases', async (req, res) => {
    const { name } = createPhaseRequest.parse(req.body);
    res
      .status(201)
      .json(
        toPhaseResponse(
          await uc.createPhase.execute({ actor: actor(req), projectId: req.params.id, name }),
        ),
      );
  });
  router.post('/projects/:id/blocks', async (req, res) => {
    const body = createBlockRequest.parse(req.body);
    res.status(201).json(
      toBlockResponse(
        await uc.createBlock.execute({
          actor: actor(req),
          projectId: req.params.id,
          name: body.name,
          kind: body.kind,
          phaseId: body.phase_id,
        }),
      ),
    );
  });
  return router;
}
