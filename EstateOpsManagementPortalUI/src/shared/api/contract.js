import { ContractError } from './ApiError.js';

/**
 * Parses a raw response with its DTO schema. Drift becomes one typed
 * ContractError at the boundary instead of a crash deep inside a component.
 */
export function parseDto(schema, raw, entity) {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const error = new ContractError({ entity, issues: result.error.issues });
    console.error(`[contract] ${entity}`, result.error.issues);
    throw error;
  }
  return result.data;
}
