import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

/** Loading placeholder rows. Announced once to assistive tech. */
export default function Skeleton({ rows = 5 }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <span className="sr-only">{t('states.loading')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-border/60" />
      ))}
    </div>
  );
}

Skeleton.propTypes = { rows: PropTypes.number };
