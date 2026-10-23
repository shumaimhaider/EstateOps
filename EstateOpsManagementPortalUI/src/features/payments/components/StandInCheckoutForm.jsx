import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { config } from '@/shared/config/config.js';
import Button from '@/shared/ui/Button.jsx';
import TextField from '@/shared/ui/TextField.jsx';

const CARD_NUMBER = /^\d{13,19}$/;
const EXPIRY = /^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/;
const CVC = /^\d{3,4}$/;

/**
 * The stand-in Stripe server (tests and demos with the real back end) takes the card on its own
 * control address, the way the real page would take it: never through the EstateOps API.
 */
function completeOnStandInStripe(clientSecret, card) {
  const [month, year] = card.expiry.split('/').map((p) => Number(p.trim()));
  const sessionId = clientSecret.split('_secret_')[0];
  const base = config.stripeApiUrl.replace(/\/v1$/, '');
  return fetch(`${base}/_mock/checkout-sessions/${sessionId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card: {
        number: card.number,
        exp_month: month,
        exp_year: year < 100 ? 2000 + year : year,
        cvc: card.cvc,
      },
    }),
  });
}

/**
 * Stand-in for Stripe's embedded Checkout form, used in mock mode. Like the real one it sends the
 * card straight to "Stripe" (never to the EstateOps API), and a declined card keeps the form open
 * so another card can be tried.
 */
export default function StandInCheckoutForm({ clientSecret, onComplete }) {
  const { t } = useTranslation('payments');
  const [values, setValues] = useState({ number: '', expiry: '', cvc: '' });
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const found = {};
    if (!CARD_NUMBER.test(values.number.replace(/\s/g, '')))
      found.number = t('checkout.errors.number');
    if (!EXPIRY.test(values.expiry)) found.expiry = t('checkout.errors.expiry');
    if (!CVC.test(values.cvc)) found.cvc = t('checkout.errors.cvc');
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setProblem('');
    try {
      const res = await completeOnStandInStripe(clientSecret, {
        number: values.number.replace(/\s/g, ''),
        expiry: values.expiry,
        cvc: values.cvc,
      });
      const body = await res.json();
      if (!res.ok) {
        setProblem(body.error?.message ?? 'The card was not accepted.');
        return;
      }
      onComplete();
    } catch {
      setProblem('Could not reach Stripe. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-label={t('checkout.title')} className="space-y-3">
      <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-content-muted">
        {t('checkout.mockNote')} {t('checkout.testHint')}
      </p>
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <TextField
        label={t('checkout.cardNumber')}
        inputMode="numeric"
        autoComplete="cc-number"
        value={values.number}
        onChange={set('number')}
        error={errors.number}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={t('checkout.expiry')}
          placeholder="MM/YY"
          autoComplete="cc-exp"
          value={values.expiry}
          onChange={set('expiry')}
          error={errors.expiry}
        />
        <TextField
          label={t('checkout.cvc')}
          inputMode="numeric"
          autoComplete="cc-csc"
          value={values.cvc}
          onChange={set('cvc')}
          error={errors.cvc}
        />
      </div>
      <Button type="submit" loading={busy} className="w-full">
        {busy ? t('checkout.paying') : t('checkout.pay')}
      </Button>
      <p className="text-center text-xs text-content-muted">{t('checkout.poweredBy')}</p>
    </form>
  );
}

StandInCheckoutForm.propTypes = {
  clientSecret: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
};
