import PropTypes from 'prop-types';

/** Percentage bar; `label` is the accessible name. */
export default function ProgressBar({ value, label, tone = 'primary' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const fill = tone === 'success' ? 'bg-tone-success-fg' : 'bg-primary';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

ProgressBar.propTypes = {
  value: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(['primary', 'success']),
};
