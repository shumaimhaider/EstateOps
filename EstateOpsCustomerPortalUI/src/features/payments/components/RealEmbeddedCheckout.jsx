import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

/**
 * Stripe's own Embedded Checkout form, mounted from the client secret the API returned. Loaded on
 * demand so Stripe.js is only fetched when someone actually pays. The card goes from this form to
 * Stripe; EstateOps never sees it.
 */
export default function RealEmbeddedCheckout({ clientSecret, publishableKey, onComplete }) {
  const { t } = useTranslation('payments');
  const holder = useRef(null);
  const [problem, setProblem] = useState('');
  const done = useRef(onComplete);
  done.current = onComplete;

  useEffect(() => {
    let checkout;
    let cancelled = false;
    (async () => {
      try {
        const { loadStripe } = await import('@stripe/stripe-js');
        const stripe = await loadStripe(publishableKey);
        if (!stripe) throw new Error('Stripe could not be loaded');
        checkout = await stripe.initEmbeddedCheckout({
          clientSecret,
          onComplete: () => done.current(),
        });
        if (cancelled) checkout.destroy();
        else checkout.mount(holder.current);
      } catch (error) {
        if (!cancelled) setProblem(error.message);
      }
    })();
    return () => {
      cancelled = true;
      checkout?.destroy();
    };
  }, [clientSecret, publishableKey]);

  return (
    <div>
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <div ref={holder} aria-label={t('checkout.title')} aria-busy={!problem} />
    </div>
  );
}

RealEmbeddedCheckout.propTypes = {
  clientSecret: PropTypes.string.isRequired,
  publishableKey: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
};
