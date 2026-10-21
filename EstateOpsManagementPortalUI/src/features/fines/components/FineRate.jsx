import { useTranslation } from 'react-i18next';
import Money from '@/shared/ui/Money.jsx';
import { fineRuleShape } from '../domain/fineRule.model.js';

/** "2% of each overdue installment" or "PKR 5,000 per overdue installment". */
export default function FineRate({ rule }) {
  const { t } = useTranslation('fines');
  return rule.kind === 'percent' ? (
    <span>{t('rate.percent', { value: rule.percent })}</span>
  ) : (
    <span>
      <Money minor={rule.amount.minor} currency={rule.amount.currency} /> {t('rate.fixed')}
    </span>
  );
}

FineRate.propTypes = { rule: fineRuleShape.isRequired };
