import express from 'express';
import multer from 'multer';
import { fieldError, toIso } from '@estateops/kernel';
import { MAX_FILE_BYTES } from '../domain/contract.js';
import { actorFrom, customerFrom, pageResponse } from '@estateops/platform';
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
  router.post('/contracts/:id/signing-session', async (req, res) => {
    const session = await uc.createSigningSession.execute({
      actor: actorFrom(req),
      id: req.params.id,
    });
    res.status(201).json({
      contract_id: session.contractId,
      url: session.url,
      expires_at: session.expiresAt,
    });
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

/** What a customer sees of a contract: its state and whether they can sign or download it. */
export const toPortalContractResponse = (c) => ({
  id: c.id,
  booking_id: c.bookingId,
  title: c.title,
  kind: c.kind,
  status: c.status,
  version: c.version,
  sent_at: c.sentAt ? toIso(c.sentAt) : null,
  signed_at: c.signedAt ? toIso(c.signedAt) : null,
  can_sign: c.kind === 'pandadoc' && ['sent', 'viewed'].includes(c.status),
  can_download: c.status === 'signed',
});

/** The customer portal's contracts: their own, read-only, signing on screen, and the signed copy. */
export function createPortalContractRoutes(uc) {
  const router = express.Router();
  const me = (req) => ({ ...customerFrom(req) });
  router.get('/properties/:bookingId/contracts', async (req, res) => {
    const items = await uc.listMyContracts.execute({
      customer: me(req),
      bookingId: req.params.bookingId,
    });
    res.json({ data: items.map(toPortalContractResponse), next_cursor: null });
  });
  router.post('/contracts/:id/signing-session', async (req, res) => {
    const s = await uc.createSigningSession.execute({ actor: me(req), id: req.params.id });
    res.status(201).json({ contract_id: s.contractId, url: s.url, expires_at: s.expiresAt });
  });
  router.get('/contracts/:id/file', async (req, res) => {
    const file = await uc.downloadMyContract.execute({ customer: me(req), id: req.params.id });
    const name = String(file.fileName).replace(/[^\w. -]/g, '_');
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${name}"`,
    });
    res.send(file.buffer);
  });
  return router;
}
