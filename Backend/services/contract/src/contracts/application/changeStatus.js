import { contractMachine } from '../domain/contract.js';
import { contractStatusChanged } from './events.js';

/**
 * Moves a (locked) contract along its machine, stamps sent/signed times, audits it and announces
 * contract.status_changed. Shared by everything that changes a contract's status.
 */
export async function changeStatus({
  repos,
  clock,
  actor,
  contract,
  action,
  auditAction = `contract.${action}`,
}) {
  const now = clock.now();
  const next = { ...contract, status: contractMachine.transition(contract.status, action) };
  if (next.status === 'sent') next.sentAt = now;
  if (next.status === 'signed') next.signedAt = now;
  const saved = await repos.contracts.update(next);
  await repos.audit.record({
    tenantId: contract.tenantId,
    actor,
    action: auditAction,
    subjectType: 'contract',
    subjectId: contract.id,
    before: { status: contract.status },
    after: { status: saved.status },
  });
  await repos.outbox.add(contractStatusChanged(saved, now));
  return saved;
}
