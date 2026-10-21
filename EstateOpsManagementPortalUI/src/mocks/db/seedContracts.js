import { faker } from '@faker-js/faker';
import { atNoon } from '../engine/dates.js';

/** Every completed (fully paid) booking has its sale agreement signed through PandaDoc. */
export function seedContracts(db) {
  for (const booking of db.bookings.filter((b) => b.status === 'completed')) {
    const customer = db.customers.find((c) => c.id === booking.customer_id);
    const at = atNoon(booking.booked_at);
    db.contracts.push({
      id: faker.string.uuid(),
      tenant_id: booking.tenant_id,
      booking_id: booking.id,
      kind: 'pandadoc',
      title: 'Sale agreement',
      template: 'sale_agreement',
      status: 'signed',
      version: 1,
      supersedes_id: null,
      revision_note: null,
      file_name: null,
      file_size: null,
      pandadoc_document_id: `pd_${faker.string.alphanumeric(12)}`,
      signer_email: customer.email,
      sent_at: at,
      signed_at: at,
      created_by_name: null,
      created_at: at,
      updated_at: at,
    });
  }
}
