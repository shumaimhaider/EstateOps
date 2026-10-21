import { http } from 'msw';
import {
  actOnContract,
  createPandaDocContract,
  listContracts,
  simulateContractEvent,
  uploadSignedContract,
} from '../../engine/contracts.js';
import { respond, restPage } from './respond.js';

const API = '*/api/v1/admin';
const query = (request) => Object.fromEntries(new URL(request.url).searchParams);

export const contractRestHandlers = [
  http.get(`${API}/contracts`, ({ request }) =>
    respond(request, {
      name: 'contracts.list',
      perform: (db, ctx) => restPage(listContracts(db, ctx, query(request))),
    }),
  ),
  // multipart: the signed PDF is sent as `file` (the mock keeps only its metadata)
  http.post(`${API}/bookings/:id/contracts/signed`, async ({ request, params }) => {
    const form = await request.clone().formData();
    const file = form.get('file');
    const upload = {
      fileName: file?.name,
      fileSize: file?.size,
      contentType: file?.type,
      title: form.get('title') ?? undefined,
    };
    return respond(
      request,
      {
        name: 'contracts.upload',
        write: true,
        perform: (db, ctx) => uploadSignedContract(db, ctx, params.id, upload),
      },
      { status: 201 },
    );
  }),
  http.post(`${API}/bookings/:id/contracts/pandadoc`, async ({ request, params }) => {
    const body = await request.clone().json();
    return respond(
      request,
      {
        name: 'contracts.create',
        write: true,
        perform: (db, ctx) => createPandaDocContract(db, ctx, params.id, body),
      },
      { status: 201 },
    );
  }),
  ...['send', 'void', 'revise'].map((action) =>
    http.post(`${API}/contracts/:id/${action}`, async ({ request, params }) => {
      const body = request.headers.get('Content-Type') ? await request.clone().json() : {};
      return respond(request, {
        name: `contracts.${action}`,
        write: true,
        perform: (db, ctx) => actOnContract(db, ctx, params.id, action, body),
      });
    }),
  ),
  http.post(`${API}/mock/contracts/:id/events/:event`, ({ request, params }) =>
    respond(request, {
      name: 'contracts.event',
      write: true,
      perform: (db, ctx) => simulateContractEvent(db, ctx, params.id, params.event),
    }),
  ),
];
