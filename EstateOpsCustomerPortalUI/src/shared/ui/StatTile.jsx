import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Card from './Card.jsx';

const TONES = {
  primary: 'bg-primary-soft text-primary',
  success: 'bg-tone-success-bg text-tone-success-fg',
  warning: 'bg-tone-warning-bg text-tone-warning-fg',
  danger: 'bg-tone-danger-bg text-tone-danger-fg',
  info: 'bg-tone-info-bg text-tone-info-fg',
};

/**
 * Headline number. Pass `to` and the whole tile becomes a link to the list behind it,
 * so every dashboard number opens its filtered list.
 */
export default function StatTile({ label, value, hint, icon: Icon, tone = 'primary', to }) {
  const body = (
    <Card
      className={`h-full ${to ? 'transition hover:-translate-y-0.5 hover:border-primary/40' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-content-muted">{label}</p>
        {Icon && (
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}>
            <Icon aria-hidden="true" className="size-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-content-muted">{hint}</p>}
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}

StatTile.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  hint: PropTypes.node,
  icon: PropTypes.elementType,
  tone: PropTypes.oneOf(Object.keys(TONES)),
  to: PropTypes.string,
};
