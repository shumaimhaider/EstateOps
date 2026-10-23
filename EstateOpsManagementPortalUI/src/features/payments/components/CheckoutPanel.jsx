import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useCheckoutResult } from '../hooks/useCheckoutMutations.js';
import EmbeddedCheckout from './EmbeddedCheckout.jsx';

/** What happened, in words, for a settled checkout. */
function outcomeOf(result, t) {
  if (result.purpose === 'save_card')
    return { tone: 'success', text: t('checkout.result.cardSaved') };
  const tx = result.transaction;
  if (result.status === 'expired') return { tone: 'warning', text: t('checkout.result.canceled') };
  if (tx?.status === 'succeeded') return { tone: 'success', text: t('checkout.result.succeeded') };
  if (tx?.status === 'refunded') return { tone: 'warning', text: t('checkout.result.refunded') };
  if (tx?.status === 'failed')
    return {
      tone: 'danger',
      text: t('checkout.result.failed', { message: tx.failureMessage ?? '' }),
    };
  return { tone: 'warning', text: t('checkout.result.pending') };
}

/**
 * The embedded card form plus what comes after it: once the form reports it is done, the server
 * is asked how the checkout ended (it checks with Stripe if needed) and the result is shown.
 * `onFinished(result)` fires once the checkout is settled.
 */
export default function CheckoutPanel({ checkout, onFinished, onCancel }) {
  const { t } = useTranslation('payments');
  const [submitted, setSubmitted] = useState(false);
  const result = useCheckoutResult(checkout.checkoutId, { enabled: submitted });
  const settled = result.data && result.data.status !== 'open';

  if (settled) {
    const outcome = outcomeOf(result.data, t);
    return (
      <div className="space-y-4">
        <p
          role="status"
          className={`rounded-xl p-3 text-sm ${outcome.tone === 'success' ? 'bg-tone-success-bg text-tone-success-fg' : outcome.tone === 'danger' ? 'bg-tone-danger-bg text-tone-danger-fg' : 'bg-tone-warning-bg text-tone-warning-fg'}`}
        >
          {outcome.text}
        </p>
        <div className="flex justify-end">
          <Button onClick={() => onFinished(result.data)}>{t('checkout.done')}</Button>
        </div>
      </div>
    );
  }
  if (submitted) {
    return (
      <div role="status" aria-live="polite">
        <p className="mb-3 text-sm text-content-muted">{t('checkout.confirming')}</p>
        <Skeleton rows={2} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <EmbeddedCheckout
        clientSecret={checkout.clientSecret}
        publishableKey={checkout.publishableKey}
        onComplete={() => setSubmitted(true)}
      />
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onCancel}>
          {t('checkout.cancel')}
        </Button>
      </div>
    </div>
  );
}

CheckoutPanel.propTypes = {
  checkout: PropTypes.shape({
    checkoutId: PropTypes.string.isRequired,
    clientSecret: PropTypes.string.isRequired,
    publishableKey: PropTypes.string.isRequired,
  }).isRequired,
  onFinished: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
