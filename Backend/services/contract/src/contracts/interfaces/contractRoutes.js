import express from 'express';
import multer from 'multer';
import { fieldError } from '@estateops/kernel';
import { MAX_FILE_BYTES } from '../domain/contract.js';
import { actorFrom, pageResponse } from '@estateops/platform';
import {
  listContractsQuery,
  pandaDocRequest,
  reviseRequest,
  toContractResponse,
} from './contract.dto.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});
const SAFE_NAME = /[^\w. -]/g;

/** Runs multer and turns its size error into the field error the form shows. */
const receiveFile = (req, res) =>
  new Promise((resolve, reject) =>
    upload.single('file')(req, res, (error) => {
      if (!error) return resolve();
      reject(
        error.code === 'LIMIT_FILE_SIZE'
          ? fieldError(
              'file',
              'The file must be between 1 byte and 10 MB',
              'The contract could not be uploaded',
            )
          : error,
      );
    }),
  );

export function createContractRoutes(uc, { mockSigner = false } = {}) {
  const router = express.Router();

  router.get('/contracts', async (req, res) => {
    const { booking_id: bookingId } = listContractsQuery.parse(req.query);
    res.json(
      pageResponse(
        await uc.listContracts.execute({ actor: actorFrom(req), bookingId }),
        toContractResponse,
      ),
    );
  });

  router.post('/bookings/:id/contracts/signed', async (req, res) => {
    await receiveFile(req, res);
    const file = req.file && {
      name: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
      buffer: req.file.buffer,
    };
    const created = await uc.uploadSignedContract.execute({
      actor: actorFrom(req),
      bookingId: req.params.id,
      file,
      title: req.body?.title,
    });
    res.status(201).json(toContractResponse(created));
  });
  router.post('/bookings/:id/contracts/pandadoc', async (req, res) => {
    const { template } = pandaDocRequest.parse(req.body);
    res.status(201).json(
      toContractResponse(
        await uc.createPandaDocContract.execute({
          actor: actorFrom(req),
          bookingId: req.params.id,
          template,
        }),
      ),
    );
  });
  for (const action of ['send', 'void', 'revise']) {
    router.post(`/contracts/:id/${action}`, async (req, res) => {
      const { note } = reviseRequest.parse(req.body ?? {});
      res.json(
        toContractResponse(
          await uc.actOnContract.execute({
            actor: actorFrom(req),
            id: req.params.id,
            action,
            note,
          }),
        ),
      );
    });
  }
  router.get('/contracts/:id/file', async (req, res) => {
    const file = await uc.downloadContractFile.execute({
      actor: actorFrom(req),
      id: req.params.id,
    });
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.fileName.replace(SAFE_NAME, '_')}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(file.buffer);
  });

  if (mockSigner) {
    // Development only: stands in for the e-signature provider's webhook.
    router.post('/mock/contracts/:id/events/:event', async (req, res) => {
      res.json(
        toContractResponse(
          await uc.simulateSignerEvent.execute({
            actor: actorFrom(req),
            id: req.params.id,
            event: req.params.event,
          }),
        ),
      );
    });
  }
  return router;
}
