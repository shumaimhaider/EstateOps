import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { config } from '@/shared/config/config.js';
import TextField from '@/shared/ui/TextField.jsx';

/** Card inputs. The values go to Stripe only; they are never sent to the EstateOps API. */
export default function CardFields({ field }) {
  const { t } = useTranslation('collections');
  return (
    <>
      <TextField
        className="sm:col-span-2"
        label={t('pay.card.number')}
        hint={config.isMock ? t('pay.card.testHint') : undefined}
        inputMode="numeric"
        autoComplete="cc-number"
        {...field('cardNumber')}
      />
      <TextField
        label={t('pay.card.expiry')}
        placeholder="MM/YY"
        autoComplete="cc-exp"
        {...field('cardExpiry')}
      />
      <TextField
        label={t('pay.card.cvc')}
        inputMode="numeric"
        autoComplete="cc-csc"
        {...field('cardCvc')}
      />
    </>
  );
}

CardFields.propTypes = { field: PropTypes.func.isRequired };
