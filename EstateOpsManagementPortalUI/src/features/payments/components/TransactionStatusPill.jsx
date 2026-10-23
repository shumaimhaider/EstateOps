import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import StatusPill from '@/shared/ui/StatusPill.jsx';

const TONE = {
  pending: 'info',
  succeeded: 'success',
  failed: 'danger',
  refunded: 'warning',
  canceled: 'neutral',
};

export default function TransactionStatusPill({ status }) {
  const { t } = useTranslation('payments');
  return <StatusPill label={t(`transactions.status.${status}`)} tone={TONE[status] ?? 'neutral'} />;
}

TransactionStatusPill.propTypes = { status: PropTypes.string.isRequired };
