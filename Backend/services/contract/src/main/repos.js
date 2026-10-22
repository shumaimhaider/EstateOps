import {
  ContractRepositoryTypeorm,
  ContractRow,
} from '../contracts/infrastructure/ContractRepositoryTypeorm.js';
import { BookingRefRepositoryTypeorm } from '../refs/infrastructure/BookingRefRepositoryTypeorm.js';

export const ENTITIES = [ContractRow];

export const buildRepos = (manager) => ({
  contracts: new ContractRepositoryTypeorm(manager),
  bookingRefs: new BookingRefRepositoryTypeorm(manager),
});
