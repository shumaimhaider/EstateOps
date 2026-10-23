import { createHmac, randomUUID } from 'node:crypto';
import express from 'express';
import { token } from './ids.js';

/**
 * A stand-in for the PandaDoc public API (v1): same paths, `API-Key` authorisation, document
 * objects, status strings, embedded-signing sessions, and `document_state_changed` webhooks
 * (an array of events, signed with HMAC-SHA256 of the raw body in the `signature` query value).
 *
 * Statuses move: draft -> sent -> viewed -> completed | declined, or voided from any open state.
 * The `/_mock` routes play the signer.
 */
export const PANDADOC_STATUS = Object.freeze({
  DRAFT: 'document.draft',
  SENT: 'document.sent',
  VIEWED: 'document.viewed',
  COMPLETED: 'document.completed',
  DECLINED: 'document.declined',
  VOIDED: 'document.voided',
});
const STATUS_CODE = {
  [PANDADOC_STATUS.DRAFT]: 0,
  [PANDADOC_STATUS.SENT]: 1,
  [PANDADOC_STATUS.COMPLETED]: 2,
  [PANDADOC_STATUS.VIEWED]: 5,
  [PANDADOC_STATUS.DECLINED]: 10,
  [PANDADOC_STATUS.VOIDED]: 11,
};
const OPEN = new Set([PANDADOC_STATUS.DRAFT, PANDADOC_STATUS.SENT, PANDADOC_STATUS.VIEWED]);
const iso = (ms) => new Date(ms).toISOString();

const apiError = (res, status, type, detail) =>
  res
    .status(status)
    .json({ type, detail, ...(status === 400 && { info_code: 'validation_error' }) });

export function createMockPandaDoc({
  apiKey = 'pandadoc_mock_key',
  sharedKey = 'pandadoc_mock_shared',
  webhookUrl = null,
  templates = [],
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const state = {
    documents: new Map(),
    templates: new Map(templates.map((t) => [t.id, t])),
    sessions: new Map(),
    events: [],
    deliveries: [],
    requests: [],
    config: { webhookUrl, sharedKey },
  };

  const sign = (body) => createHmac('sha256', state.config.sharedKey).update(body).digest('hex');

  async function deliver(events) {
    if (!state.config.webhookUrl) return;
    const body = JSON.stringify(events);
    const url = new URL(state.config.webhookUrl);
    url.searchParams.set('signature', sign(body));
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      state.deliveries.push({ status: res.status, events: events.length });
    } catch (error) {
      state.deliveries.push({ status: 0, error: error.message });
    }
  }

  const view = (d) => ({
    id: d.id,
    name: d.name,
    status: d.status,
    date_created: iso(d.created),
    date_modified: iso(d.modified),
    expiration_date: null,
    version: '2',
    uuid: d.id,
    autonumbering_sequence_name_prefix: null,
    template: d.template
      ? { id: d.template, name: state.templates.get(d.template)?.name ?? null }
      : null,
    created_by: {
      id: 'mock-user',
      email: 'owner@example.com',
      first_name: 'Mock',
      last_name: 'Owner',
    },
    metadata: d.metadata,
    tokens: d.tokens,
    recipients: d.recipients.map((r) => ({ ...r })),
    grand_total: { amount: '0.00', currency: 'USD' },
  });

  async function transition(d, status, { actor, sync = false } = {}) {
    d.status = status;
    d.modified = now();
    if (status === PANDADOC_STATUS.COMPLETED)
      d.recipients.forEach((r) => {
        r.has_completed = true;
      });
    const event = {
      event: 'document_state_changed',
      data: {
        id: d.id,
        name: d.name,
        status,
        status_code: STATUS_CODE[status],
        date_created: iso(d.created),
        date_modified: iso(d.modified),
        metadata: d.metadata,
        recipients: d.recipients.map((r) => ({ ...r })),
        ...(actor && { action_by: { email: actor } }),
      },
    };
    state.events.push(event);
    // The real PandaDoc delivers webhooks after the API call has answered. Awaiting the delivery
    // inside an API request would make a caller that is itself handling our webhook wait on us.
    if (sync) await deliver([event]);
    else deliver([event]).catch(() => {});
    return event;
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.use('/public/v1', (req, res, next) => {
    state.requests.push({ method: req.method, path: req.path, body: req.body });
    if (req.get('authorization') !== `API-Key ${apiKey}`) {
      return res.status(401).json({
        type: 'authentication_error',
        detail: 'Authentication credentials were not provided or are invalid.',
      });
    }
    return next();
  });

  const find = (req, res) => {
    const d = state.documents.get(req.params.id);
    if (!d) apiError(res, 404, 'request_error', 'Document not found.');
    return d;
  };

  app.get('/public/v1/templates', (_req, res) =>
    res.json({
      results: [...state.templates.values()].map((t) => ({
        id: t.id,
        name: t.name,
        date_created: iso(0),
        date_modified: iso(0),
        version: '2',
      })),
    }),
  );

  app.post('/public/v1/documents', async (req, res) => {
    const { name, template_uuid: templateId, recipients, tokens, metadata } = req.body ?? {};
    if (!name) return apiError(res, 400, 'validation_error', { name: ['This field is required.'] });
    if (templateId && !state.templates.has(templateId))
      return apiError(res, 404, 'request_error', `Template ${templateId} not found.`);
    if (!Array.isArray(recipients) || recipients.length === 0 || recipients.some((r) => !r.email)) {
      return apiError(res, 400, 'validation_error', {
        recipients: ['At least one recipient with an email is required.'],
      });
    }
    const d = {
      id: token(22),
      name,
      template: templateId ?? null,
      created: now(),
      modified: now(),
      status: PANDADOC_STATUS.DRAFT,
      metadata: metadata ?? {},
      tokens: tokens ?? [],
      recipients: recipients.map((r) => ({
        id: token(22),
        first_name: r.first_name ?? '',
        last_name: r.last_name ?? '',
        email: r.email,
        recipient_type: 'signer',
        has_completed: false,
        role: r.role ?? 'Buyer',
        signing_order: r.signing_order ?? null,
      })),
    };
    state.documents.set(d.id, d);
    // The real API answers 201 with "document.uploaded"; the document becomes draft a moment later.
    const created = {
      ...view(d),
      status: 'document.uploaded',
      info_message: 'Document was uploaded and is being processed.',
    };
    state.events.push({
      event: 'document_state_changed',
      data: { id: d.id, status: PANDADOC_STATUS.DRAFT },
    });
    return res.status(201).json(created);
  });

  app.get('/public/v1/documents/:id', (req, res) => {
    const d = find(req, res);
    if (d) res.json(view(d));
  });
  app.get('/public/v1/documents/:id/details', (req, res) => {
    const d = find(req, res);
    if (d) res.json(view(d));
  });

  app.post('/public/v1/documents/:id/send', async (req, res) => {
    const d = find(req, res);
    if (!d) return undefined;
    if (d.status !== PANDADOC_STATUS.DRAFT) {
      return apiError(
        res,
        409,
        'request_error',
        `Document status must be document.draft to send, it is ${d.status}.`,
      );
    }
    await transition(d, PANDADOC_STATUS.SENT);
    return res.json({
      ...view(d),
      message: req.body?.message ?? null,
      subject: req.body?.subject ?? null,
    });
  });

  app.post('/public/v1/documents/:id/session', (req, res) => {
    const d = find(req, res);
    if (!d) return undefined;
    if (d.status !== PANDADOC_STATUS.SENT && d.status !== PANDADOC_STATUS.VIEWED) {
      return apiError(
        res,
        409,
        'request_error',
        `Document status must be sent to create a session, it is ${d.status}.`,
      );
    }
    const email = req.body?.recipient;
    if (!d.recipients.some((r) => r.email === email)) {
      return apiError(res, 400, 'validation_error', {
        recipient: ['Recipient is not on this document.'],
      });
    }
    const lifetime = Number(req.body?.lifetime ?? 900);
    const session = { id: token(22), expires_at: iso(now() + lifetime * 1000) };
    state.sessions.set(session.id, { document: d.id, email });
    return res.status(201).json(session);
  });

  const changeStatus = async (req, res) => {
    const d = find(req, res);
    if (!d) return undefined;
    if (req.body?.status !== 11 && req.body?.status !== 'document.voided')
      return apiError(res, 400, 'validation_error', { status: ['Unsupported status.'] });
    if (!OPEN.has(d.status))
      return apiError(res, 409, 'request_error', `A ${d.status} document cannot be voided.`);
    await transition(d, PANDADOC_STATUS.VOIDED);
    return res.json(view(d));
  };
  app.post('/public/v1/documents/:id/status', changeStatus);
  app.patch('/public/v1/documents/:id/status', changeStatus);

  app.get('/public/v1/documents/:id/download', (req, res) => {
    const d = find(req, res);
    if (!d) return undefined;
    res.type('application/pdf');
    return res.send(Buffer.from(`%PDF-1.4\n% mock ${d.name}\n%%EOF\n`));
  });

  app.delete('/public/v1/documents/:id', (req, res) => {
    const d = find(req, res);
    if (!d) return undefined;
    state.documents.delete(d.id);
    return res.status(204).end();
  });

  // ---- control plane: the signer ----------------------------------------------------------
  const control = express.Router();
  control.use(express.json());
  const act = (status) => async (req, res) => {
    const d = state.documents.get(req.params.id);
    if (!d) return res.status(404).json({ type: 'request_error', detail: 'Document not found.' });
    const allowed =
      status === PANDADOC_STATUS.VIEWED
        ? [PANDADOC_STATUS.SENT]
        : [PANDADOC_STATUS.SENT, PANDADOC_STATUS.VIEWED];
    if (!allowed.includes(d.status))
      return res
        .status(409)
        .json({ type: 'request_error', detail: `Cannot become ${status} from ${d.status}.` });
    await transition(d, status, { actor: d.recipients[0]?.email, sync: true });
    return res.json(view(d));
  };
  control.post('/documents/:id/view', act(PANDADOC_STATUS.VIEWED));
  control.post('/documents/:id/sign', act(PANDADOC_STATUS.COMPLETED));
  control.post('/documents/:id/decline', act(PANDADOC_STATUS.DECLINED));
  control.post('/config', (req, res) => {
    Object.assign(state.config, req.body);
    res.json(state.config);
  });
  control.get('/events', (_req, res) => res.json(state.events));
  control.get('/deliveries', (_req, res) => res.json(state.deliveries));
  control.post('/reset', (_req, res) => {
    for (const k of ['documents', 'sessions']) state[k].clear();
    for (const k of ['events', 'deliveries', 'requests']) state[k].length = 0;
    res.json({ ok: true });
  });
  /** A page like PandaDoc's embedded signing view, for a browser. */
  app.get('/s/:session', (req, res) => {
    const s = state.sessions.get(req.params.session);
    if (!s) return res.status(404).type('text/plain').send('Session not found');
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Sign document</title>
<body><h1>Sign ${s.document}</h1><p>Signer: ${s.email}</p>
<button id="sign" onclick="fetch('/_mock/documents/${s.document}/sign',{method:'POST'}).then(()=>{document.body.append('Signed');parent.postMessage({type:'session_view.document.completed'},'*')})">Sign</button>
<button id="decline" onclick="fetch('/_mock/documents/${s.document}/decline',{method:'POST'}).then(()=>parent.postMessage({type:'session_view.document.exception'},'*'))">Decline</button></body>`);
  });
  app.use('/_mock', control);
  app.use((_req, res) => res.status(404).json({ type: 'request_error', detail: 'Not found.' }));

  return { app, state, sign, transition, newTemplateId: () => randomUUID() };
}
