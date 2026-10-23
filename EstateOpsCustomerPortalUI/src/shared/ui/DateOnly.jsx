import PropTypes from 'prop-types';
import { formatDateOnly } from '@/shared/lib/dates.js';

/** A calendar date ('YYYY-MM-DD'); no time-zone conversion. */
export default function DateOnly({ value }) {
  if (!value) return <span aria-label="none">—</span>;
  return (
    <time dateTime={value} className="whitespace-nowrap">
      {formatDateOnly(value)}
    </time>
  );
}

DateOnly.propTypes = { value: PropTypes.string };
