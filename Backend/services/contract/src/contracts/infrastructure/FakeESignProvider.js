import { createHmac, randomUUID } from 'node:crypto';
import { WebhookSignatureError } from '../application/esignPort.js';

/**
 * An in-memory e-signature provider with the same port as the PandaDoc client, for fast unit
 * tests. It records what it was asked. The signer's own actions (open, sign, decline) arrive as
 * webhook events: `signWebhook` builds a correctly signed body, as PandaDoc would send it.
 */
export function createFakeESignProvider({ sharedKey = 'fake-shared-key' } = {}) {
  const documents = new Map();
  return {
    documents,
    sharedKey,
    async createDocument({ template, signerEmail, bookingId }) {
      const documentId = `pd_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      documents.set(documentId, {
        documentId,
        template,
        signerEmail,
        bookingId,
        sent: false,
        voided: false,
        sessions: [],
      });
      return { documentId };
    },
    async sendDocument(documentId, signerEmail) {
      const doc = documents.get(documentId);
      if (doc) Object.assign(doc, { sent: true, signerEmail });
    },
    async voidDocument(documentId) {
      const doc = documents.get(documentId);
      if (doc) doc.voided = true;
    },
    async createSigningSession(documentId, signerEmail, { lifetimeSec = 900 } = {}) {
      const sessionId = `sess_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      documents.get(documentId)?.sessions.push({ sessionId, signerEmail });
      return {
        sessionId,
        expiresAt: new Date(Date.now() + lifetimeSec * 1000).toISOString(),
        url: `https://sign.test/s/${sessionId}`,
      };
    },
    async downloadDocument(documentId) {
      return Buffer.from(`%PDF-1.4 signed ${documentId}`);
    },
    verifyWebhook(rawBody, signature) {
      const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
      if (createHmac('sha256', sharedKey).update(body).digest('hex') !== signature) {
        throw new WebhookSignatureError('The webhook signature does not match');
      }
      return JSON.parse(body.toString()).map((e) => ({
        documentId: e.data.id,
        status: e.data.status,
        at: null,
      }));
    },
    /** A signed webhook body and signature for these events, like PandaDoc's. */
    signWebhook(events) {
      const body = JSON.stringify(
        events.map(([id, status]) => ({ event: 'document_state_changed', data: { id, status } })),
      );
      return { body, signature: createHmac('sha256', sharedKey).update(body).digest('hex') };
    },
  };
}
