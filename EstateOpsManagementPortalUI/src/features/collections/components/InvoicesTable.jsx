import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { HandCoins } from 'lucide-react';
import Button from '@/shared/ui/Button.jsx';
import DataTable from '@/shared/ui/DataTable.jsx';
import DateOnly from '@/shared/ui/DateOnly.jsx';
import Money from '@/shared/ui/Money.jsx';
import { moneyCell } from '@/shared/ui/moneyCell.jsx';
import { canRecordPayment, isAdjusted } from '../domain/installment.rules.js';
import { invoiceShape } from '../domain/installment.model.js';
import InvoiceStatusPill from './InvoiceStatusPill.jsx';

const HIDDEN_BY_VARIANT = {
  register: {},
  schedule: { buyer: false, unit: false, receipt: false },
  customer: { buyer: false, receipt: false },
};

/**
 * The full scheduled-invoice table. `variant="schedule"` is the per-booking EMI schedule
 * (buyer and unit columns are hidden); `variant="register"` is the tenant-wide register.
 */
export default function InvoicesTable({
  invoices,
  variant = 'register',
  sort,
  onSortChange,
  onRecordPayment,
  toolbarStart,
}) {
  const { t } = useTranslation('collections');

  const columns = useMemo(
    () => [
      {
        id: 'invoiceNo',
        header: t('columns.invoice'),
        meta: { sortField: 'invoiceNo' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-xs">{row.original.invoiceNo}</span>
        ),
      },
      {
        id: 'installment',
        header: t('columns.installment'),
        meta: { sortField: 'sequence' },
        cell: ({ row }) =>
          row.original.kind === 'down_payment'
            ? t('kind.down_payment')
            : t('kind.emi', { number: row.original.sequence }),
      },
      { id: 'buyer', header: t('columns.buyer'), accessorFn: (i) => i.buyerName },
      {
        id: 'unit',
        header: t('columns.unit'),
        cell: ({ row }) => (
          <span>
            <span className="font-medium">{row.original.unitNo}</span>
            <span className="block text-xs text-content-muted">{row.original.projectName}</span>
          </span>
        ),
      },
      {
        id: 'dueDate',
        header: t('columns.dueDate'),
        meta: { sortField: 'dueDate' },
        cell: ({ row }) => <DateOnly value={row.original.dueDate} />,
      },
      {
        id: 'amount',
        header: t('columns.amount'),
        meta: { sortField: 'amount', align: 'end' },
        cell: ({ row }) => (
          <span>
            <Money minor={row.original.amount.minor} currency={row.original.amount.currency} />
            {isAdjusted(row.original) && (
              <span
                className="block text-xs text-content-muted"
                title={row.original.adjustmentReason ?? undefined}
              >
                {t('columns.adjustedFrom')}{' '}
                <Money
                  minor={row.original.originalAmount.minor}
                  currency={row.original.originalAmount.currency}
                />
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'paid',
        header: t('columns.paid'),
        meta: { align: 'end' },
        cell: moneyCell((i) => i.paid),
      },
      {
        id: 'balance',
        header: t('columns.balance'),
        meta: { sortField: 'balance', align: 'end' },
        cell: moneyCell((i) => i.balance),
      },
      {
        id: 'fine',
        header: t('columns.fine'),
        meta: { align: 'end' },
        cell: moneyCell((i) => i.fine),
      },
      {
        id: 'status',
        header: t('columns.status'),
        meta: { sortField: 'status' },
        cell: ({ row }) => <InvoiceStatusPill invoice={row.original} />,
      },
      {
        id: 'receipt',
        header: t('columns.receipt'),
        cell: ({ row }) => row.original.receiptNo ?? '—',
      },
      {
        id: 'actions',
        header: t('columns.actions'),
        enableHiding: false,
        meta: { srOnly: true, align: 'end' },
        cell: ({ row }) =>
          onRecordPayment && canRecordPayment(row.original) && row.original.balance.minor > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              aria-label={`${t('pay.action')} ${row.original.invoiceNo}`}
              onClick={() => onRecordPayment(row.original)}
            >
              <HandCoins aria-hidden="true" className="size-3.5" />
              {t('pay.actionShort')}
              <span className="sr-only"> {row.original.invoiceNo}</span>
            </Button>
          ) : null,
      },
    ],
    [t, onRecordPayment],
  );

  return (
    <DataTable
      columns={columns}
      data={invoices}
      getRowId={(i) => i.id}
      label={t('register.tableLabel')}
      sort={sort}
      onSortChange={onSortChange}
      toolbarStart={toolbarStart}
      initialColumnVisibility={HIDDEN_BY_VARIANT[variant]}
      rowClassName={(i) => (i.status === 'overdue' ? 'bg-tone-danger-bg/30' : '')}
    />
  );
}

InvoicesTable.propTypes = {
  invoices: PropTypes.arrayOf(invoiceShape).isRequired,
  variant: PropTypes.oneOf(['register', 'schedule', 'customer']),
  sort: PropTypes.shape({ field: PropTypes.string, dir: PropTypes.string }),
  onSortChange: PropTypes.func,
  onRecordPayment: PropTypes.func,
  toolbarStart: PropTypes.node,
};
