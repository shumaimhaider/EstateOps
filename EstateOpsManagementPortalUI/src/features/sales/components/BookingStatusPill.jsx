import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { BOOKING_STATUS_META } from '../domain/booking.constants.js';

export default function BookingStatusPill({ status }) {
  const { t } = useTranslation();
  const meta = BOOKING_STATUS_META[status];
  return <StatusPill label={t(meta.labelKey)} tone={meta.tone} />;
}

BookingStatusPill.propTypes = { status: PropTypes.string.isRequired };
