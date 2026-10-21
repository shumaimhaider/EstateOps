import PropTypes from 'prop-types';

/**
 * A sale contract of a booking: a signed PDF uploaded by staff or a PandaDoc document.
 * Revising an open PandaDoc contract voids it and opens the next version as a draft.
 * @typedef {'draft'|'sent'|'viewed'|'signed'|'declined'|'voided'} ContractStatus
 * @typedef {{
 *   id: string, bookingId: string, kind: 'signed_upload'|'pandadoc', title: string,
 *   template: string|null, status: ContractStatus, version: number, supersedesId: string|null,
 *   revisionNote: string|null, fileName: string|null, fileSize: number|null,
 *   pandaDocUrl: string|null, signerEmail: string|null, sentAt: string|null,
 *   signedAt: string|null, allowedActions: string[], createdByName: string|null,
 *   createdAt: string, updatedAt: string
 * }} Contract
 */
export const contractShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  kind: PropTypes.oneOf(['signed_upload', 'pandadoc']).isRequired,
  title: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  version: PropTypes.number.isRequired,
  allowedActions: PropTypes.arrayOf(PropTypes.string).isRequired,
});
