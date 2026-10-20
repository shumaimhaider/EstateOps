import { config } from './config.js';

/** Feature flags. Add flags here; never read them from env anywhere else. */
export const flags = Object.freeze({
  simulationPanel: config.isMock,
  tenantSwitcher: config.isMock,
});
