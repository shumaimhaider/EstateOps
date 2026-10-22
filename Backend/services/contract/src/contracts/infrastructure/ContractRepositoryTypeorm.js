import { EntitySchema } from 'typeorm';
import { ConflictError } from '@estateops/kernel';
import { pgCode, pgConstraint, updateVersioned } from '@estateops/platform';

const c = (type, extra = {}) => ({ type, ...extra });

export const ContractRow = new EntitySchema({
  name: 'ContractRow',
  tableName: 'contract',
  schema: 'contract',
  columns: {
    id: c('uuid', { primary: true }),
    tenant_id: c('uuid'),
    booking_id: c('uuid'),
    kind: c('text'),
    title: c('text'),
    template: c('text', { nullable: true }),
    status: c('text'),
    version: c('int'),
    supersedes_id: c('uuid', { nullable: true }),
    revision_note: c('text', { nullable: true }),
    file_key: c('text', { nullable: true }),
    file_name: c('text', { nullable: true }),
    file_size: c('bigint', { nullable: true }),
    content_type: c('text', { nullable: true }),
    provider_document_id: c('text', { nullable: true }),
    signer_email: c('text', { nullable: true }),
    sent_at: c('timestamptz', { nullable: true }),
    signed_at: c('timestamptz', { nullable: true }),
    created_by_name: c('text', { nullable: true }),
    created_at: c('timestamptz', { insert: false, update: false }),
    updated_at: c('timestamptz', { insert: false }),
    version_lock: c('int', { insert: false }),
  },
});

export const toContract = (r) => ({
  id: r.id,
  tenantId: r.tenant_id,
  bookingId: r.booking_id,
  kind: r.kind,
  title: r.title,
  template: r.template,
  status: r.status,
  version: r.version,
  supersedesId: r.supersedes_id,
  revisionNote: r.revision_note,
  fileKey: r.file_key,
  fileName: r.file_name,
  fileSize: r.file_size,
  contentType: r.content_type,
  providerDocumentId: r.provider_document_id,
  signerEmail: r.signer_email,
  sentAt: r.sent_at,
  signedAt: r.signed_at,
  createdByName: r.created_by_name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lockVersion: r.version_lock,
});

/** The partial unique indexes make "one signed" and "one open" true even when two requests race. */
const translate = (error) => {
  if (pgCode(error) !== '23505') throw error;
  const name = pgConstraint(error);
  if (name === 'contract_one_signed_uq')
    throw new ConflictError(
      'CONTRACT_ALREADY_SIGNED',
      'This booking already has a signed contract',
    );
  if (name === 'contract_one_open_uq')
    throw new ConflictError(
      'CONTRACT_OPEN',
      'An unsigned contract is already open; revise it instead',
    );
  throw new ConflictError(
    'CONTRACT_VERSION_TAKEN',
    'Another contract was created at the same time. Try again.',
  );
};

export class ContractRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
    this.repo = manager.getRepository(ContractRow);
  }

  async insert(k) {
    await this.repo
      .insert({
        id: k.id,
        tenant_id: k.tenantId,
        booking_id: k.bookingId,
        kind: k.kind,
        title: k.title,
        template: k.template,
        status: k.status,
        version: k.version,
        supersedes_id: k.supersedesId,
        revision_note: k.revisionNote,
        file_key: k.fileKey,
        file_name: k.fileName,
        file_size: k.fileSize,
        content_type: k.contentType,
        provider_document_id: k.providerDocumentId,
        signer_email: k.signerEmail,
        sent_at: k.sentAt,
        signed_at: k.signedAt,
        created_by_name: k.createdByName,
      })
      .catch(translate);
    return k;
  }

  async findById(tenantId, id, { lock = false } = {}) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.id = :id AND c.tenant_id = :tenantId', { id, tenantId });
    if (lock) qb.setLock('pessimistic_write');
    const row = await qb.getOne();
    return row ? toContract(row) : null;
  }

  /** Newest version first. `lock: true` locks the booking's contracts so starting a second one waits its turn. */
  async listForBooking(tenantId, bookingId, { lock = false } = {}) {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId AND c.booking_id = :bookingId', { tenantId, bookingId })
      .orderBy('c.version', 'DESC');
    if (lock) {
      // lock the booking row itself (rows may not exist yet), so two creators queue up
      await this.manager.query(
        'SELECT 1 FROM contract.booking_ref WHERE booking_id = $1 FOR UPDATE',
        [bookingId],
      );
    }
    return (await qb.getMany()).map(toContract);
  }

  async update(k) {
    const lockVersion = await updateVersioned(this.manager, ContractRow, {
      where: { id: k.id, tenant_id: k.tenantId },
      version: k.lockVersion,
      set: { status: k.status, sent_at: k.sentAt, signed_at: k.signedAt },
      versionColumn: 'version_lock',
    }).catch(translate);
    return { ...k, lockVersion };
  }
}
