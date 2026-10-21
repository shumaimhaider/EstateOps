import { http } from 'msw';
import { listEscalations, sendNotice } from '../../engine/escalations.js';
import { listInstallments, payInstallment } from '../../engine/installments.js';
import { createPaymentIntent, recordStripePayment } from '../../engine/stripe.js';
import { collectionsStats } from '../../engine/stats.js';
import { respond, restPage } from './respond.js';

const API = '*/api/v1/admin';
const query = (request) => Object.fromEntries(new URL(request.url).searchParams);

export const collectionsRestHandlers = [
  http.get(`${API}/installments`, ({ request }) =>
    respond(request, {
      name: 'installments.list',
      perform: (db, ctx) => restPage(listInstallments(db, ctx, query(request))),
    }),
  ),
  http.post(`${API}/installments/:id/pay`, async ({ request, params }) => {
    const body = await request.clone().json();
    return respond(request, {
      name: 'installments.pay',
      write: true,
      perform: (db, ctx) => payInstallment(db, ctx, params.id, body),
    });
  }),
  http.post(`${API}/installments/:id/payment-intents`, async ({ request, params }) => {
    const body = await request.clone().json();
    return respond(
      request,
      {
        name: 'installments.paymentIntent',
        write: true,
        perform: (db, ctx) => createPaymentIntent(db, ctx, params.id, body),
      },
      { status: 201 },
    );
  }),
  http.post(`${API}/installments/:id/card-payments`, async ({ request, params }) => {
    const body = await request.clone().json();
    return respond(request, {
      name: 'installments.cardPayment',
      write: true,
      perform: (db, ctx) => recordStripePayment(db, ctx, params.id, body),
    });
  }),
  http.get(`${API}/escalations`, ({ request }) =>
    respond(request, {
      name: 'escalations.list',
      perform: (db, ctx) => restPage(listEscalations(db, ctx, query(request))),
    }),
  ),
  http.post(`${API}/escalations/:id/notice`, ({ request, params }) =>
    respond(request, {
      name: 'escalations.notice',
      write: true,
      perform: (db, ctx) => sendNotice(db, ctx, params.id),
    }),
  ),
  http.get(`${API}/stats/collections`, ({ request }) =>
    respond(request, {
      name: 'stats.collections',
      perform: (db, ctx) => collectionsStats(db, ctx, query(request)),
    }),
  ),
];
