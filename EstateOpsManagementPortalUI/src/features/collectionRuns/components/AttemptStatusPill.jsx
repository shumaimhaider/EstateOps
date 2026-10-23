import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import StatusPill from '@/shared/ui/StatusPill.jsx';

const TONE = {
  succeeded: 'success',
  failed: 'danger',
  refunded: 'warning',
  skipped: 'neutral',
  queued: 'info',
  in_progress: 'info',
};

export default function AttemptStatusPill({ status }) {
  const { t } = useTranslation('collectionRuns');
  return <StatusPill label={t(`status.${status}`)} tone={TONE[status] ?? 'neutral'} />;
}
AttemptStatusPill.propTypes = { status: PropTypes.string.isRequired };
