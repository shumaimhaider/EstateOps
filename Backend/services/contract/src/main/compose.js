import { EVENT } from '@estateops/contracts';
import { createEventConsumerRouter, createServiceApp } from '@estateops/platform';
import { ActOnContract } from '../contracts/application/ActOnContract.js';
import { CreatePandaDocContract } from '../contracts/application/CreatePandaDocContract.js';
import { DownloadContractFile } from '../contracts/application/DownloadContractFile.js';
import { ListContracts } from '../contracts/application/ListContracts.js';
import { SimulateSignerEvent } from '../contracts/application/SimulateSignerEvent.js';
import { UploadSignedContract } from '../contracts/application/UploadSignedContract.js';
import { createContractRoutes } from '../contracts/interfaces/contractRoutes.js';
import { ApplyBookingCancelled } from '../refs/application/ApplyBookingCancelled.js';
import { ApplyBookingConfirmed } from '../refs/application/ApplyBookingConfirmed.js';

/**
 * Composition root of the contract service. `files` is the FileStore port (local disk today) and
 * `esign` the e-signature provider port (a fake today); `mockSigner` mounts the development-only
 * route that stands in for the provider's webhook.
 */
export function composeContract({
  uow,
  clock,
  files,
  esign,
  verifier,
  logger,
  internalToken,
  idempotencyStore = null,
  readyCheck,
  mockSigner = false,
}) {
  const deps = { uow, clock };
  const routes = createContractRoutes(
    {
      listContracts: new ListContracts(deps),
      uploadSignedContract: new UploadSignedContract({ ...deps, files, esign }),
      createPandaDocContract: new CreatePandaDocContract({ ...deps, esign }),
      actOnContract: new ActOnContract({ ...deps, esign }),
      simulateSignerEvent: new SimulateSignerEvent(deps),
      downloadContractFile: new DownloadContractFile({ uow, files }),
    },
    { mockSigner },
  );
  const handlers = {
    [EVENT.BOOKING_CONFIRMED]: (e) => new ApplyBookingConfirmed(deps).execute(e),
    [EVENT.BOOKING_CANCELLED]: (e) => new ApplyBookingCancelled({ ...deps, esign }).execute(e),
  };
  return createServiceApp({
    name: 'contract',
    logger,
    verifier,
    internalToken,
    idempotencyStore,
    readyCheck,
    adminRouters: [routes],
    internalRouters: [createEventConsumerRouter({ handlers, logger })],
  });
}
