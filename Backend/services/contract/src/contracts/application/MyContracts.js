import { ConflictError, NotFoundError } from '@estateops/kernel';

/** What a customer sees of their contracts: sent, being signed, signed or declined; never drafts or voided versions. */
const SHOWN = new Set(['sent', 'viewed', 'signed', 'declined']);

const ownBooking = async (repos, customer, bookingId) => {
  const booking = await repos.bookingRefs.findById(customer.tenantId, bookingId);
  if (!booking || booking.customerId !== customer.customerId || booking.cancelled) {
    throw new NotFoundError('Property not found');
  }
  return booking;
};

/** The contracts of one of the customer's own properties. */
export class ListMyContracts {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ customer, bookingId }) {
    return this.uow.read(async (repos) => {
      await ownBooking(repos, customer, bookingId);
      const all = await repos.contracts.listForBooking(customer.tenantId, bookingId);
      return all.filter((c) => SHOWN.has(c.status));
    });
  }
}

/** The signed copy of one of the customer's own contracts. */
export class DownloadMyContract {
  constructor({ uow, files, esign }) {
    Object.assign(this, { uow, files, esign });
  }

  async execute({ customer, id }) {
    const contract = await this.uow.read(async (repos) => {
      const found = await repos.contracts.findById(customer.tenantId, id);
      if (!found) return null;
      const booking = await repos.bookingRefs.findById(customer.tenantId, found.bookingId);
      return booking?.customerId === customer.customerId ? found : null;
    });
    if (!contract) throw new NotFoundError('Contract not found');
    if (contract.status !== 'signed')
      throw new ConflictError('NOT_SIGNED', 'This contract is not signed yet');
    if (contract.kind === 'pandadoc') {
      return {
        fileName: `${contract.title}.pdf`,
        contentType: 'application/pdf',
        buffer: await this.esign.downloadDocument(contract.providerDocumentId),
      };
    }
    return {
      fileName: contract.fileName,
      contentType: contract.contentType,
      buffer: await this.files.get(contract.fileKey),
    };
  }
}
