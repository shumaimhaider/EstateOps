import PropTypes from 'prop-types';

const TONES = {
  success: 'bg-tone-success-bg text-tone-success-fg',
  warning: 'bg-tone-warning-bg text-tone-warning-fg',
  info: 'bg-tone-info-bg text-tone-info-fg',
  danger: 'bg-tone-danger-bg text-tone-danger-fg',
  neutral: 'bg-tone-neutral-bg text-tone-neutral-fg',
  accent: 'bg-tone-accent-bg text-tone-accent-fg',
};

/** Colour is never the only signal: the label is always rendered as text, next to a dot. */
export default function StatusPill({ label, tone = 'neutral' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

StatusPill.propTypes = {
  label: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(Object.keys(TONES)),
};
