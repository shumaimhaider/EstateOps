import PropTypes from 'prop-types';
import { formatDateTime } from '@/shared/lib/dates.js';
import { useTenant } from '@/shared/lib/tenant.jsx';

/** ISO string in, tenant-time-zone text out. */
export default function DateTime({ iso }) {
  const { timeZone } = useTenant();
  return <time dateTime={iso}>{formatDateTime(iso, timeZone)}</time>;
}

DateTime.propTypes = { iso: PropTypes.string.isRequired };
