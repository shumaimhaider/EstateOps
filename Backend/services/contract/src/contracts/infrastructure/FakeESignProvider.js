import { randomUUID } from 'node:crypto';

/**
 * A stand-in for the e-signature provider (PandaDoc) behind the same port the real adapter will
 * have: createDocument, sendDocument, voidDocument. It only records what was asked, so tests can
 * check the provider was told. The signer's own actions (open, sign, decline) arrive as events.
 */
export function createFakeESignProvider() {
  const documents = new Map();
  return {
    documents,
    async createDocument({ template, signerEmail, bookingId }) {
      const documentId = `pd_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      documents.set(documentId, {
        documentId,
        template,
        signerEmail,
        bookingId,
        sent: false,
        voided: false,
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
  };
}
