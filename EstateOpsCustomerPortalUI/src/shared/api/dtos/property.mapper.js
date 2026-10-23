import { money } from '../../lib/money.js';

export const propertyFromApi = (d) => ({
  id: d.id,
  unitNo: d.unit_no,
  kind: d.unit_kind,
  projectName: d.project_name,
  status: d.status,
  planName: d.plan_name,
  total: money(d.total_price, d.currency),
  currency: d.currency,
  installments: {
    total: d.installments_total,
    paid: d.installments_paid,
    due: d.installments_due,
    overdue: d.installments_overdue,
    upcoming: d.installments_upcoming,
  },
  received: money(d.received_amount, d.currency),
  pending: money(d.pending_amount, d.currency),
  overdue: money(d.overdue_amount, d.currency),
  fines: money(d.fine_amount, d.currency),
  nextDueDate: d.next_due_date,
  bookedAt: d.booked_at,
});

export const invoiceFromApi = (d) => ({
  id: d.id,
  invoiceNo: d.invoice_no,
  kind: d.kind,
  sequence: d.seq,
  status: d.status,
  issuedOn: d.issued_on,
  dueDate: d.due_date,
  amount: money(d.amount, d.currency),
  paid: money(d.paid_amount, d.currency),
  balance: money(d.balance, d.currency),
  fine: money(d.fine_amount, d.currency),
  daysLate: d.days_late,
  paidAt: d.paid_at,
  receiptNo: d.receipt_no,
  payable: d.payable,
});

export const contractFromApi = (d) => ({
  id: d.id,
  bookingId: d.booking_id,
  title: d.title,
  kind: d.kind,
  status: d.status,
  version: d.version,
  sentAt: d.sent_at,
  signedAt: d.signed_at,
  canSign: d.can_sign,
  canDownload: d.can_download,
});

export const sessionFromApi = (d) => ({
  contractId: d.contract_id,
  url: d.url,
  expiresAt: d.expires_at,
});
