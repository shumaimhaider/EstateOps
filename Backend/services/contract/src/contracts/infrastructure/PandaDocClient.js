import { createHmac, timingSafeEqual } from 'node:crypto';
import { ProviderError, WebhookSignatureError } from '../application/esignPort.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VOIDED = 11;

/**
 * PandaDoc public API v1 over fetch. Documents are made from templates with the buyer as the only
 * recipient. A new document is "uploaded" for a moment before it is a draft, so sending waits for
 * the draft. Embedded signing uses a short-lived session on the document for the buyer's address.
 *
 * `templates`: { sale_agreement: '<uuid>', payment_plan_addendum: '<uuid>' }.
 */
export function createPandaDocClient({
  apiKey,
  baseUrl = 'https://api.pandadoc.com',
  sessionBaseUrl = 'https://app.pandadoc.com/s',
  sharedKey,
  templates,
  fetchImpl = fetch,
  pollMs = 300,
  pollTries = 20,
  role = 'Buyer',
}) {
  async function call(method, path, body, { raw = false } = {}) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}/public/v1${path}`, {
        method,
        headers: {
          authorization: `API-Key ${apiKey}`,
          ...(body !== undefined && { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (cause) {
      throw new ProviderError(`PandaDoc could not be reached: ${cause.message}`, {
        code: 'UNREACHABLE',
      });
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      let message = `PandaDoc answered ${res.status}`;
      try {
        const parsed = JSON.parse(detail);
        message =
          typeof parsed.detail === 'string'
            ? parsed.detail
            : JSON.stringify(parsed.detail ?? parsed);
      } catch {
        /* keep the status message */
      }
      throw new ProviderError(message, { status: res.status });
    }
    if (raw) return Buffer.from(await res.arrayBuffer());
    return res.status === 204 ? null : res.json();
  }

  async function waitForDraft(documentId) {
    for (let i = 0; i < pollTries; i += 1) {
      const doc = await call('GET', `/documents/${documentId}`);
      if (doc.status === 'document.draft') return;
      if (doc.status !== 'document.uploaded') {
        throw new ProviderError(`The document is ${doc.status}, not a draft`, { status: 409 });
      }
      await sleep(pollMs);
    }
    throw new ProviderError('PandaDoc is still preparing the document', { code: 'NOT_READY' });
  }

  return {
    async createDocument({ template, signerEmail, signerName, bookingId, unitNo }) {
      const templateId = templates[template];
      if (!templateId)
        throw new ProviderError(`No PandaDoc template is set for ${template}`, {
          code: 'NO_TEMPLATE',
        });
      const [first = '', ...rest] = String(signerName ?? '').split(' ');
      const created = await call('POST', '/documents', {
        name: `${template.replaceAll('_', ' ')} · unit ${unitNo ?? ''}`.trim(),
        template_uuid: templateId,
        recipients: [{ email: signerEmail, first_name: first, last_name: rest.join(' '), role }],
        tokens: [
          { name: 'Buyer.Name', value: signerName ?? '' },
          { name: 'Unit.Number', value: unitNo ?? '' },
        ],
        metadata: { booking_id: bookingId },
      });
      return { documentId: created.id };
    },

    async sendDocument(documentId, signerEmail, { subject, message } = {}) {
      await waitForDraft(documentId);
      await call('POST', `/documents/${documentId}/send`, {
        subject: subject ?? 'Please review and sign your contract',
        message: message ?? 'Your property contract is ready to sign.',
        silent: false,
      });
      void signerEmail;
    },

    /**
     * Voids a document. A document the provider already finished (declined, signed, voided) or no
     * longer has cannot be voided and needs no voiding, so those answers (409, 404) count as done.
     */
    async voidDocument(documentId) {
      try {
        await call('PATCH', `/documents/${documentId}/status`, { status: VOIDED });
      } catch (error) {
        if (!(error instanceof ProviderError) || ![404, 409].includes(error.status)) throw error;
      }
    },

    async createSigningSession(documentId, signerEmail, { lifetimeSec = 900 } = {}) {
      const session = await call('POST', `/documents/${documentId}/session`, {
        recipient: signerEmail,
        lifetime: lifetimeSec,
      });
      return {
        sessionId: session.id,
        expiresAt: session.expires_at,
        url: `${sessionBaseUrl}/${session.id}`,
      };
    },

    downloadDocument(documentId) {
      return call('GET', `/documents/${documentId}/download`, undefined, { raw: true });
    },

    /** PandaDoc signs the raw body with the shared key (HMAC-SHA256, hex) and sends it as `signature`. */
    verifyWebhook(rawBody, signature) {
      const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''));
      const expected = createHmac('sha256', sharedKey).update(body).digest('hex');
      const given = Buffer.from(String(signature ?? ''));
      if (given.length !== expected.length || !timingSafeEqual(given, Buffer.from(expected))) {
        throw new WebhookSignatureError('The webhook signature does not match');
      }
      let events;
      try {
        events = JSON.parse(body.toString('utf8'));
      } catch {
        throw new WebhookSignatureError('The webhook body is not JSON');
      }
      return (Array.isArray(events) ? events : [events])
        .filter((e) => e?.event === 'document_state_changed' && e.data?.id)
        .map((e) => ({
          documentId: e.data.id,
          status: e.data.status,
          at: e.data.date_modified ?? null,
        }));
    },
  };
}
