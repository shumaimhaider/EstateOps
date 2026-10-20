import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import Button from '@/shared/ui/Button.jsx';
import DataTable from '@/shared/ui/DataTable.jsx';
import DateOnly from '@/shared/ui/DateOnly.jsx';
import DateTime from '@/shared/ui/DateTime.jsx';
import Money from '@/shared/ui/Money.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { escalationShape } from '../domain/escalation.model.js';

/** Escalated cases: bookings with N or more missed installments, worst first. */
export default function EscalationsTable({ escalations, onSendNotice, pendingId, toolbarStart }) {
  const { t } = useTranslation('collections');

  const columns = useMemo(
    () => [
      {
        id: 'unit',
        header: t('columns.unit'),
        cell: ({ row }) => (
          <Link
            className="font-semibold text-primary hover:underline"
            to={`/sales/${row.original.bookingId}`}
          >
            {row.original.unitNo}
            <span className="block text-xs font-normal text-content-muted">
              {row.original.projectName}
            </span>
          </Link>
        ),
      },
      {
        id: 'buyer',
        header: t('columns.buyer'),
        cell: ({ row }) => (
          <Link className="hover:underline" to={`/customers/${row.original.customerId}`}>
            {row.original.buyerName}
            <span className="block text-xs text-content-muted">{row.original.buyerPhone}</span>
          </Link>
        ),
      },
      {
        id: 'missed',
        header: t('columns.missed'),
        meta: { align: 'end' },
        cell: ({ row }) => (
          <StatusPill
            label={t('escalations.missed', { count: row.original.missedInstallments })}
            tone="danger"
          />
        ),
      },
      {
        id: 'overdue',
        header: t('columns.overdueAmount'),
        meta: { align: 'end' },
        cell: ({ row }) => (
          <Money minor={row.original.overdue.minor} currency={row.original.overdue.currency} />
        ),
      },
      {
        id: 'fine',
        header: t('columns.fine'),
        meta: { align: 'end' },
        cell: ({ row }) => (
          <Money minor={row.original.fine.minor} currency={row.original.fine.currency} />
        ),
      },
      {
        id: 'oldest',
        header: t('columns.oldestDue'),
        cell: ({ row }) => (
          <span>
            <DateOnly value={row.original.oldestDueDate} />
            <span className="block text-xs text-tone-danger-fg">
              {t('status.daysLate', { count: row.original.daysLate })}
            </span>
          </span>
        ),
      },
      {
        id: 'notice',
        header: t('columns.notice'),
        cell: ({ row }) =>
          row.original.noticeSentAt ? (
            <span className="text-xs">
              <StatusPill label={t('escalations.noticeSent')} tone="success" />
              <span className="mt-1 block text-content-muted">
                <DateTime iso={row.original.noticeSentAt} />
              </span>
            </span>
          ) : (
            <StatusPill label={t('escalations.noNotice')} tone="warning" />
          ),
      },
      {
        id: 'actions',
        header: t('columns.actions'),
        enableHiding: false,
        meta: { srOnly: true, align: 'end' },
        cell: ({ row }) =>
          row.original.allowedActions.includes('send_notice') ? (
            <Button
              size="sm"
              variant="secondary"
              loading={pendingId === row.original.id}
              aria-label={`${t('escalations.sendNotice')} ${row.original.unitNo}`}
              onClick={() => onSendNotice(row.original)}
            >
              <Send aria-hidden="true" className="size-3.5" />
              {t('escalations.sendNotice')}
            </Button>
          ) : null,
      },
    ],
    [t, onSendNotice, pendingId],
  );

  return (
    <DataTable
      columns={columns}
      data={escalations}
      getRowId={(e) => e.id}
      label={t('escalations.tableLabel')}
      toolbarStart={toolbarStart}
    />
  );
}

EscalationsTable.propTypes = {
  escalations: PropTypes.arrayOf(escalationShape).isRequired,
  onSendNotice: PropTypes.func.isRequired,
  pendingId: PropTypes.string,
  toolbarStart: PropTypes.node,
};
