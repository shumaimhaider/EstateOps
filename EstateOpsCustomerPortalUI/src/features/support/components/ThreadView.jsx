import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import DateTime from '@/shared/ui/DateTime.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { useReplyMutation, useThreadQuery } from '../hooks/support.hooks.js';
import MessageField from './MessageField.jsx';

/** One conversation: the messages in order and a box to add to it. */
export default function ThreadView({ id }) {
  const { t } = useTranslation('support');
  const query = useThreadQuery(id);
  const reply = useReplyMutation(id);
  const formik = useFormik({
    initialValues: { message: '' },
    validate: zodValidate(
      z.object({
        message: z.string().trim().min(1, t('errors.message')).max(4000, t('errors.messageLong')),
      }),
    ),
    onSubmit: async (values, helpers) => {
      try {
        await reply.mutateAsync(values.message.trim());
        helpers.resetForm();
      } catch (error) {
        if (!applyServerErrors(helpers, error)) helpers.setStatus({ formError: error.message });
      }
    },
  });
  if (query.isPending) return <Skeleton rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const thread = query.data;
  return (
    <section aria-label={thread.subject} className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{thread.subject}</h2>
        <StatusPill
          label={t(`status.${thread.status}`)}
          tone={
            thread.status === 'answered'
              ? 'success'
              : thread.status === 'closed'
                ? 'neutral'
                : 'info'
          }
        />
      </div>
      <ol className="space-y-3">
        {thread.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-2xl p-3 text-sm ${m.authorKind === 'customer' ? 'ms-8 bg-primary-soft' : 'me-8 bg-surface-muted'}`}
          >
            <p className="mb-1 text-xs text-content-muted">
              {m.authorKind === 'customer' ? t('thread.you') : m.authorName} ·{' '}
              <DateTime iso={m.createdAt} />
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>
      <form onSubmit={formik.handleSubmit} noValidate className="space-y-3">
        {formik.status?.formError && (
          <p role="alert" className="text-sm text-danger">
            {formik.status.formError}
          </p>
        )}
        <MessageField
          label={t('thread.reply')}
          {...formik.getFieldProps('message')}
          error={formik.touched.message ? formik.errors.message : undefined}
        />
        <Button type="submit" loading={formik.isSubmitting}>
          {t('thread.send')}
        </Button>
      </form>
    </section>
  );
}
ThreadView.propTypes = { id: PropTypes.string.isRequired };
