import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import DataTable from '@/shared/ui/DataTable.jsx';
import DateTime from '@/shared/ui/DateTime.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import LoadMore from '@/shared/ui/LoadMore.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { CONTROL } from '@/shared/ui/fieldStyles.js';
import { useSupportQueueQuery } from '../hooks/support.hooks.js';
import SupportStatusPill from './SupportStatusPill.jsx';

const STATUSES = ['', 'open', 'answered', 'closed'];

/** The queue of customers' support requests, filtered by status or searched; opening one is up to the page. */
export default function SupportQueue({ onOpen }) {
  const { t } = useTranslation('support');
  const [status, setStatus] = useState('');
  const [text, setText] = useState('');
  const query = useSupportQueueQuery({ status, q: text.trim() || undefined });

  const columns = useMemo(
    () => [
      {
        id: 'subject',
        header: t('columns.subject'),
        cell: ({ row }) => <span className="font-medium">{row.original.subject}</span>,
      },
      {
        id: 'customer',
        header: t('columns.customer'),
        cell: ({ row }) => row.original.customerName,
      },
      {
        id: 'status',
        header: t('columns.status'),
        cell: ({ row }) => <SupportStatusPill status={row.original.status} />,
      },
      {
        id: 'messages',
        header: t('columns.messages'),
        meta: { align: 'end' },
        cell: ({ row }) => row.original.messageCount ?? '—',
      },
      {
        id: 'last',
        header: t('columns.last'),
        cell: ({ row }) => <DateTime iso={row.original.lastMessageAt} />,
      },
      {
        id: 'open',
        header: t('open'),
        cell: ({ row }) => (
          <Button
            variant="secondary"
            size="sm"
            aria-label={t('openLabel', {
              subject: row.original.subject,
              customer: row.original.customerName,
            })}
            onClick={() => onOpen(row.original)}
          >
            {t('open')}
          </Button>
        ),
      },
    ],
    [t, onOpen],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="support-status" className="mb-1 block text-sm font-medium">
            {t('filterStatus')}
          </label>
          <select
            id="support-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={CONTROL}
          >
            {STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {s ? t(`status.${s}`) : t('all')}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-60 flex-1">
          <label htmlFor="support-search" className="mb-1 block text-sm font-medium">
            {t('search')}
          </label>
          <input
            id="support-search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={CONTROL}
          />
        </div>
      </div>
      {query.isPending && <Skeleton rows={4} />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.isSuccess && query.requests.length === 0 && <EmptyState title={t('empty')} />}
      {query.isSuccess && query.requests.length > 0 && (
        <DataTable
          columns={columns}
          data={query.requests}
          getRowId={(r) => r.id}
          label={t('title')}
        />
      )}
      <LoadMore
        hasNextPage={query.hasNextPage}
        loading={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      />
    </div>
  );
}
SupportQueue.propTypes = { onOpen: PropTypes.func.isRequired };
