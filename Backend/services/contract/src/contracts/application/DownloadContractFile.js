import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

/** The uploaded PDF of a signed-upload contract. Needs contracts.view. */
export class DownloadContractFile {
  constructor({ uow, files }) {
    Object.assign(this, { uow, files });
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.CONTRACTS_VIEW);
    const contract = await this.uow.read((repos) => repos.contracts.findById(actor.tenantId, id));
    if (!contract) throw new NotFoundError('Contract not found');
    if (!contract.fileKey) throw new ConflictError('NO_FILE', 'This contract has no uploaded file');
    return {
      fileName: contract.fileName,
      contentType: contract.contentType,
      buffer: await this.files.get(contract.fileKey),
    };
  }
}
