import express from 'express';
import { actorFrom } from '@estateops/platform';
import {
  createFloorRequest,
  toBlockResponse,
  toFloorResponse,
  updateBlockRequest,
} from './structure.dto.js';

/** Phases, blocks and floors addressed directly by id. Creation lives under /projects/:id. */
export function createStructureRoutes(uc) {
  const router = express.Router();
  router.delete('/phases/:id', async (req, res) => {
    await uc.deletePhase.execute({ actor: actorFrom(req), id: req.params.id });
    res.status(204).end();
  });
  router.patch('/blocks/:id', async (req, res) => {
    const body = updateBlockRequest.parse(req.body);
    const patch = { name: body.name, kind: body.kind, phaseId: body.phase_id };
    res.json(
      toBlockResponse(
        await uc.updateBlock.execute({ actor: actorFrom(req), id: req.params.id, patch }),
      ),
    );
  });
  router.delete('/blocks/:id', async (req, res) => {
    await uc.deleteBlock.execute({ actor: actorFrom(req), id: req.params.id });
    res.status(204).end();
  });
  router.post('/blocks/:id/floors', async (req, res) => {
    const body = createFloorRequest.parse(req.body);
    res.status(201).json(
      toFloorResponse(
        await uc.createFloor.execute({
          actor: actorFrom(req),
          blockId: req.params.id,
          number: body.number,
          label: body.label,
        }),
      ),
    );
  });
  router.delete('/floors/:id', async (req, res) => {
    await uc.deleteFloor.execute({ actor: actorFrom(req), id: req.params.id });
    res.status(204).end();
  });
  return router;
}
