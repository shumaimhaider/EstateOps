import { NotFoundError } from '@estateops/kernel';

/**
 * The Stripe customer behind one EstateOps customer, created on first use. The idempotency key
 * makes two simultaneous first uses end up with the same Stripe customer.
 */
export async function ensureStripeCustomer({ repos, gateway, tenantId, customerId }) {
  const existing = await repos.stripeCustomers.find(tenantId, customerId);
  if (existing) return existing;
  const ref = await repos.customerRefs.find(tenantId, customerId);
  if (!ref) throw new NotFoundError('Customer not found');
  const created = await gateway.createCustomer(
    {
      email: ref.email,
      name: ref.fullName,
      metadata: { tenant_id: tenantId, customer_id: customerId },
    },
    { idempotencyKey: `cus:${tenantId}:${customerId}` },
  );
  return repos.stripeCustomers.save(tenantId, customerId, created.id);
}
