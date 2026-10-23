import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
import Button from '@/shared/ui/Button.jsx';
import Card from '@/shared/ui/Card.jsx';
import ConfirmDialog from '@/shared/ui/ConfirmDialog.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { getErrorInfo } from '@/shared/lib/errors.js';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import {
  useActivateCardMutation,
  useCardsQuery,
  useRemoveCardMutation,
  useStartCardSetupMutation,
} from '../hooks/payments.hooks.js';
import CheckoutPanel from './CheckoutPanel.jsx';

const BRAND = (brand) => brand.charAt(0).toUpperCase() + brand.slice(1);

/**
 * A customer's saved cards. Several can be kept; exactly one is active (the one charged for saved-card
 * payments). New cards are added through Stripe's own form, so card numbers never reach EstateOps.
 */
export default function SavedCardsPanel() {
  const { t } = useTranslation('payments');
  const toast = useToast();
  const query = useCardsQuery();
  const setup = useStartCardSetupMutation();
  const activate = useActivateCardMutation();
  const remove = useRemoveCardMutation();
  const [checkout, setCheckout] = useState(null);
  const [toRemove, setToRemove] = useState(null);

  const openAdd = async () => {
    try {
      setCheckout(await setup.mutateAsync());
    } catch (error) {
      toast.show({ tone: 'danger', message: getErrorInfo(error).message });
    }
  };
  const makeActive = async (card) => {
    try {
      await activate.mutateAsync(card.id);
      toast.show({
        tone: 'success',
        message: t('cards.activated', { brand: BRAND(card.brand), last4: card.last4 }),
      });
    } catch (error) {
      toast.show({ tone: 'danger', message: getErrorInfo(error).message });
    }
  };
  const confirmRemove = async () => {
    try {
      await remove.mutateAsync(toRemove.id);
      toast.show({ tone: 'success', message: t('cards.removed') });
    } catch (error) {
      toast.show({ tone: 'danger', message: getErrorInfo(error).message });
    } finally {
      setToRemove(null);
    }
  };

  return (
    <Card as="section" aria-labelledby="cards-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="cards-title" className="text-base font-semibold">
            {t('cards.title')}
          </h2>
          <p className="text-sm text-content-muted">{t('cards.customerHint')}</p>
        </div>
        <Button size="sm" onClick={openAdd} loading={setup.isPending}>
          <Plus aria-hidden="true" className="size-4" />
          {t('cards.add')}
        </Button>
      </div>

      {query.isPending && <Skeleton rows={2} />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.isSuccess && query.data.length === 0 && (
        <p className="text-sm text-content-muted">{t('cards.empty')}</p>
      )}
      {query.isSuccess && query.data.length > 0 && (
        <ul className="divide-y divide-border">
          {query.data.map((card) => {
            const brand = BRAND(card.brand);
            return (
              <li key={card.id} className="flex flex-wrap items-center gap-3 py-3">
                <CreditCard aria-hidden="true" className="size-5 text-content-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {t('cards.brand', { brand, last4: card.last4 })}
                  </p>
                  <p className="text-xs text-content-muted">
                    {t('cards.expires', {
                      month: String(card.expMonth).padStart(2, '0'),
                      year: card.expYear,
                    })}
                  </p>
                </div>
                {card.isActive && <StatusPill label={t('cards.active')} tone="success" />}
                {card.expired && <StatusPill label={t('cards.expired')} tone="danger" />}
                {!card.isActive && (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={t('cards.makeActiveLabel', { brand, last4: card.last4 })}
                    onClick={() => makeActive(card)}
                    loading={activate.isPending && activate.variables === card.id}
                  >
                    {t('cards.makeActive')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('cards.removeLabel', { brand, last4: card.last4 })}
                  onClick={() => setToRemove(card)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={Boolean(checkout)}
        onClose={() => setCheckout(null)}
        title={t('cards.addTitle')}
      >
        {checkout && (
          <CheckoutPanel
            key={checkout.checkoutId}
            checkout={checkout}
            onCancel={() => setCheckout(null)}
            onFinished={() => {
              setCheckout(null);
              query.refetch();
            }}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={Boolean(toRemove)}
        danger
        confirmLabel={t('cards.remove')}
        title={t('cards.removeTitle')}
        message={
          toRemove
            ? t('cards.removeMessage', { brand: BRAND(toRemove.brand), last4: toRemove.last4 })
            : ''
        }
        pending={remove.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </Card>
  );
}
