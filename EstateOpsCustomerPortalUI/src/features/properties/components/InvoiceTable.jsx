import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import DateOnly from '@/shared/ui/DateOnly.jsx';
import Money from '@/shared/ui/Money.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { invoiceShape } from '../domain/property.model.js';

const TONE = {
  paid: 'success',
  overdue: 'danger',
  due: 'warning',
  scheduled: 'neutral',
  waived: 'info',
};

/**
 * The payment schedule: every installment with its due date, amount, what is paid, any fine and,
 * where it can still be paid, a Pay button. `onPay(invoice)` opens the payment for that invoice.
 */
export default function InvoiceTable({ invoices, onPay, label }) {
  const { t } = useTranslation('properties');
  return (
    <div className="relative overflow-x-auto rounded-2xl border border-border bg-surface">
      <table aria-label={label ?? t('schedule.label')} className="w-full min-w-[720px] text-sm">
        <thead className="bg-surface-muted text-start text-xs uppercase tracking-wide text-content-muted">
          <tr>
            {['invoice', 'due', 'amount', 'paid', 'balance', 'status', 'actions'].map((c) => (
              <th
                key={c}
                scope="col"
                className={`px-4 py-3 text-start ${['amount', 'paid', 'balance'].includes(c) ? 'text-end' : ''}`}
              >
                {c === 'actions' ? (
                  <span className="sr-only">{t('schedule.actions')}</span>
                ) : (
                  t(`schedule.${c}`)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invoices.map((i) => (
            <tr key={i.id}>
              <th scope="row" className="px-4 py-3 text-start font-medium">
                {i.invoiceNo}
                <span className="block text-xs font-normal text-content-muted">
                  {i.kind === 'down_payment'
                    ? t('schedule.down')
                    : t('schedule.installment', { n: i.sequence })}
                </span>
              </th>
              <td className="px-4 py-3">
                <DateOnly value={i.dueDate} />
              </td>
              <td className="px-4 py-3 text-end">
                <Money minor={i.amount.minor} currency={i.amount.currency} />
              </td>
              <td className="px-4 py-3 text-end">
                <Money minor={i.paid.minor} currency={i.paid.currency} />
              </td>
              <td className="px-4 py-3 text-end">
                <Money minor={i.balance.minor} currency={i.balance.currency} />
                {i.fine.minor > 0 && (
                  <span className="block text-xs text-danger">
                    {t('schedule.fine')} <Money minor={i.fine.minor} currency={i.fine.currency} />
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusPill label={t(`invoice.${i.status}`)} tone={TONE[i.status]} />
                {i.receiptNo && (
                  <span className="mt-1 block text-xs text-content-muted">
                    {t('schedule.receipt', { no: i.receiptNo })}
                  </span>
                )}
                {i.daysLate > 0 && i.status !== 'paid' && (
                  <span className="mt-1 block text-xs text-danger">
                    {t('schedule.daysLate', { count: i.daysLate })}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-end">
                {i.payable && i.balance.minor > 0 && (
                  <Button
                    size="sm"
                    onClick={() => onPay(i)}
                    aria-label={t('schedule.payLabel', { invoice: i.invoiceNo })}
                  >
                    {t('schedule.pay')}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
InvoiceTable.propTypes = {
  invoices: PropTypes.arrayOf(invoiceShape).isRequired,
  onPay: PropTypes.func.isRequired,
  label: PropTypes.string,
};
