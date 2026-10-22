import {
  BookingRepositoryTypeorm,
  BookingRow,
} from '../bookings/infrastructure/BookingRepositoryTypeorm.js';
import { PlanRepositoryTypeorm, PlanRow } from '../plans/infrastructure/PlanRepositoryTypeorm.js';
import {
  CustomerRefRepositoryTypeorm,
  UnitRefRepositoryTypeorm,
} from '../refs/infrastructure/RefRepositoriesTypeorm.js';

export const ENTITIES = [PlanRow, BookingRow];

export const buildRepos = (manager) => ({
  plans: new PlanRepositoryTypeorm(manager),
  bookings: new BookingRepositoryTypeorm(manager),
  unitRefs: new UnitRefRepositoryTypeorm(manager),
  customerRefs: new CustomerRefRepositoryTypeorm(manager),
});
