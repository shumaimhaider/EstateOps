/** The newest contract that is not voided: the one in force (or in progress) for the booking. */
export const currentContract = (contracts) => contracts.find((c) => c.status !== 'voided') ?? null;

export const hasSignedContract = (contracts) => contracts.some((c) => c.status === 'signed');

/** A new PandaDoc contract can start only when nothing is signed or still open. */
export const canStartContract = (contracts) =>
  !contracts.some((c) => ['signed', 'draft', 'sent', 'viewed', 'declined'].includes(c.status));

export function formatFileSize(bytes) {
  if (bytes == null) return '';
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
