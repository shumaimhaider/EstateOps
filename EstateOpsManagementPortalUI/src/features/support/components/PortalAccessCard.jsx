import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import Card from '@/shared/ui/Card.jsx';
import ConfirmDialog from '@/shared/ui/ConfirmDialog.jsx';
import DateTime from '@/shared/ui/DateTime.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { getErrorInfo } from '@/shared/lib/errors.js';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import {
  usePortalAccessQuery,
  useSendLinkMutation,
  useSetAccessMutation,
} from '../hooks/support.hooks.js';

const TONE = { invited: 'info', active: 'success', disabled: 'neutral' };

/** A customer's access to the customer portal: state, send the invitation or a reset link, switch off or on. */
export default function PortalAccessCard({ customerId, canManage = false }) {
  const { t } = useTranslation('support');
  const toast = useToast();
  const query = usePortalAccessQuery(customerId);
  const send = useSendLinkMutation(customerId);
  const toggle = useSetAccessMutation(customerId);
  const [confirmOff, setConfirmOff] = useState(false);
  const fail = (error) => toast.show({ tone: 'danger', message: getErrorInfo(error).message });
  const access = query.data;

  const doSend = () =>
    send.mutate(undefined, {
      onSuccess: (a) =>
        toast.show({ tone: 'success', message: t('portal.linkSent', { email: a.email }) }),
      onError: fail,
    });
  const doToggle = (enabled) =>
    toggle.mutate(enabled, {
      onSuccess: () =>
        toast.show({ tone: 'success', message: t(enabled ? 'portal.enabled' : 'portal.disabled') }),
      onError: fail,
      onSettled: () => setConfirmOff(false),
    });

  return (
    <Card as="section" aria-labelledby={`portal-${customerId}`}>
      <h2 id={`portal-${customerId}`} className="text-base font-semibold">
        {t('portal.title')}
      </h2>
      <p className="mb-3 text-sm text-content-muted">{t('portal.hint')}</p>
      {query.isPending && <Skeleton rows={2} />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {access?.status === 'none' && (
        <p className="text-sm text-content-muted">{t('portal.none')}</p>
      )}
      {access && access.status !== 'none' && (
        <div className="space-y-3">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-content-muted">{t('portal.email')}</dt>
              <dd className="break-all text-sm">{access.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-content-muted">{t('columns.status')}</dt>
              <dd className="flex flex-wrap items-center gap-2 text-sm">
                <StatusPill
                  label={t(`portal.status.${access.status}`)}
                  tone={TONE[access.status]}
                />
                <span className="text-xs text-content-muted">
                  {t(`portal.statusHint.${access.status}`)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-content-muted">{t('portal.lastLogin')}</dt>
              <dd className="text-sm">
                {access.lastLoginAt ? <DateTime iso={access.lastLoginAt} /> : t('portal.never')}
              </dd>
            </div>
          </dl>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {access.status !== 'disabled' && (
                <Button size="sm" variant="secondary" loading={send.isPending} onClick={doSend}>
                  {access.hasPassword ? t('portal.sendReset') : t('portal.sendInvite')}
                </Button>
              )}
              {access.status === 'disabled' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={toggle.isPending}
                  onClick={() => doToggle(true)}
                >
                  {t('portal.enable')}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmOff(true)}>
                  {t('portal.disable')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmOff}
        danger
        title={t('portal.disableTitle')}
        message={t('portal.disableMessage', { email: access?.email })}
        pending={toggle.isPending}
        onConfirm={() => doToggle(false)}
        onCancel={() => setConfirmOff(false)}
      />
    </Card>
  );
}

PortalAccessCard.propTypes = { customerId: PropTypes.string.isRequired, canManage: PropTypes.bool };
