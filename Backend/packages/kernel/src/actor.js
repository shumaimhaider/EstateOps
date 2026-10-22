import { ForbiddenError } from './errors.js';

/**
 * The signed-in person as the application layer sees them: plain data, no request object.
 * @typedef {{ tenantId: string, userId: string, name: string, role: string, permissions: string[] }} Actor
 */
export const can = (actor, permission) => actor.permissions.includes(permission);

export function assertCan(actor, permission) {
  if (!can(actor, permission)) throw new ForbiddenError();
}
