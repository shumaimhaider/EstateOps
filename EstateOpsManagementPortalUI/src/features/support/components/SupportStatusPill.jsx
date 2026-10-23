import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import StatusPill from '@/shared/ui/StatusPill.jsx';

const TONE = { open: 'warning', answered: 'success', closed: 'neutral' };

export default function SupportStatusPill({ status }) {
  const { t } = useTranslation('support');
  return <StatusPill label={t(`status.${status}`)} tone={TONE[status]} />;
}
SupportStatusPill.propTypes = { status: PropTypes.string.isRequired };
