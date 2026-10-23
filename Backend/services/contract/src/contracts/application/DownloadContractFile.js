import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

/** The PDF of a contract: the uploaded copy, or PandaDoc's signed document. Needs contracts.view. */
export class DownloadContractFile {
  constructor({ uow, files, esign }) {
    Object.assign(this, { uow, files, esign });
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.CONTRACTS_VIEW);
    const contract = await this.uow.read((repos) => repos.contracts.findById(actor.tenantId, id));
    if (!contract) throw new NotFoundError('Contract not found');
    if (contract.kind === 'pandadoc') {
      // the signed copy lives at the provider; only a signed one has a final PDF
      if (contract.status !== 'signed')
        throw new ConflictError('NOT_SIGNED', 'This contract is not signed yet');
      return {
        fileName: `${contract.title}.pdf`,
        contentType: 'application/pdf',
        buffer: await this.esign.downloadDocument(contract.providerDocumentId),
      };
    }
    if (!contract.fileKey) throw new ConflictError('NO_FILE', 'This contract has no uploaded file');
    return {
      fileName: contract.fileName,
      contentType: contract.contentType,
      buffer: await this.files.get(contract.fileKey),
    };
  }
}
