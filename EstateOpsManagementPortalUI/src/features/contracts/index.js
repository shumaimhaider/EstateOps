/** Public surface of the contracts feature (signed uploads and PandaDoc contracts per booking). */
export { default as ContractsPanel } from './components/ContractsPanel.jsx';

export { useContractsQuery } from './hooks/useContractsQuery.js';
export { contractKeys } from './hooks/contracts.keys.js';

export * from './domain/contract.constants.js';
export { currentContract, hasSignedContract, canStartContract } from './domain/contract.rules.js';
export { contractShape } from './domain/contract.model.js';
