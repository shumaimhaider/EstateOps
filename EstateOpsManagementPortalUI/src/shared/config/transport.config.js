import { config } from './config.js';

/**
 * Per-feature transport override so features can migrate from REST to GraphQL
 * one at a time. A missing entry falls back to VITE_API_TRANSPORT.
 * @type {Record<string, 'rest' | 'graphql'>}
 */
export const TRANSPORT_OVERRIDES = {
  // inventory: 'graphql',
};

/** @param {string} feature @returns {'rest' | 'graphql'} */
export function resolveTransport(feature) {
  return TRANSPORT_OVERRIDES[feature] ?? config.apiTransport;
}
