import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import StatusPill from '@/shared/ui/StatusPill.jsx';

const TONE = { sufficient: 'success', insufficient: 'danger', unknown: 'neutral' };

/** Whether the customer's card had the money: proven by the charge, or by Stripe saying it was short. */
export default function FundsBadge({ funds }) {
  const { t } = useTranslation('collectionRuns');
  if (!funds) return null;
  return <StatusPill label={t(`funds.${funds}`)} tone={TONE[funds]} />;
}
FundsBadge.propTypes = { funds: PropTypes.string };
