import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import Card from '@/shared/ui/Card.jsx';
import DateTime from '@/shared/ui/DateTime.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { CONTROL, LABEL } from '@/shared/ui/fieldStyles.js';
import { getErrorInfo } from '@/shared/lib/errors.js';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import {
  useReplyMutation,
  useSupportStatusMutation,
  useSupportThreadQuery,
} from '../hooks/support.hooks.js';
import SupportStatusPill from './SupportStatusPill.jsx';

/** One conversation: the messages, a reply box (for those who may answer), and close / reopen. */
export default function SupportThread({ id, canManage = false }) {
  const { t } = useTranslation('support');
  const toast = useToast();
  const query = useSupportThreadQuery(id);
  const reply = useReplyMutation();
  const status = useSupportStatusMutation();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');

  if (query.isPending) return <Skeleton rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const thread = query.data;

  const send = (event) => {
    event.preventDefault();
    setProblem('');
    reply.mutate(
      { id, message: text },
      {
        onSuccess: () => {
          setText('');
          toast.show({ tone: 'success', message: t('reply.sent') });
        },
        onError: (error) =>
          setProblem(
            getErrorInfo(error).fieldErrors.message ??
              t('reply.failed', { message: getErrorInfo(error).message }),
          ),
      },
    );
  };
  const change = (action) =>
    status.mutate(
      { id, action },
      {
        onSuccess: () =>
          toast.show({ tone: 'success', message: t(action === 'close' ? 'closed' : 'reopened') }),
        onError: (e) => toast.show({ tone: 'danger', message: getErrorInfo(e).message }),
      },
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{thread.subject}</h2>
          <p className="text-sm text-content-muted">{thread.customerName}</p>
        </div>
        <div className="flex items-center gap-2">
          <SupportStatusPill status={thread.status} />
          {canManage && (
            <Button
              variant="secondary"
              size="sm"
              loading={status.isPending}
              onClick={() => change(thread.status === 'closed' ? 'reopen' : 'close')}
            >
              {thread.status === 'closed' ? t('reopen') : t('close')}
            </Button>
          )}
        </div>
      </div>
      <ol aria-label={t('thread.label')} className="space-y-3">
        {thread.messages.map((m) => (
          <Card
            as="li"
            key={m.id}
            className={m.authorKind === 'staff' ? 'border-primary/40 bg-primary-soft' : ''}
          >
            <p className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-content-muted">
              <span className="font-semibold">
                {m.authorKind === 'staff'
                  ? t('thread.staff', { name: m.authorName })
                  : t('thread.customer', { name: m.authorName })}
              </span>
              <DateTime iso={m.createdAt} />
            </p>
            <p className="whitespace-pre-wrap text-sm">{m.body}</p>
          </Card>
        ))}
      </ol>
      {canManage && thread.status !== 'closed' && (
        <form onSubmit={send} noValidate className="space-y-2">
          <label htmlFor="support-reply" className={LABEL}>
            {t('reply.label')}
          </label>
          <textarea
            id="support-reply"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={Boolean(problem)}
            className={CONTROL}
          />
          {problem && (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          )}
          <Button type="submit" loading={reply.isPending}>
            {t('reply.send')}
          </Button>
        </form>
      )}
      {thread.status === 'closed' && (
        <p className="text-sm text-content-muted">{t('reply.closedNote')}</p>
      )}
    </div>
  );
}
SupportThread.propTypes = { id: PropTypes.string.isRequired, canManage: PropTypes.bool };
