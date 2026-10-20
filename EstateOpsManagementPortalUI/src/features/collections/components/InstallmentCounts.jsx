import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Card from '@/shared/ui/Card.jsx';

const ITEMS = [
  { key: 'total', tone: 'text-content' },
  { key: 'paid', tone: 'text-tone-success-fg' },
  { key: 'due', tone: 'text-tone-warning-fg' },
  { key: 'overdue', tone: 'text-tone-danger-fg', link: true },
  { key: 'upcoming', tone: 'text-content-muted' },
];

/** How many installments are scheduled, and how many are in each state. Each count opens its list. */
export default function InstallmentCounts({ installments, projectId = '' }) {
  const { t } = useTranslation('collections');
  return (
    <Card as="section" aria-labelledby="installment-counts">
      <h2 id="installment-counts" className="mb-3 text-base font-semibold">
        {t('installmentCounts.title')}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {ITEMS.map(({ key, tone, link }) => {
          const body = (
            <>
              <span className={`block text-2xl font-bold tabular-nums ${tone}`}>
                {installments[key].toLocaleString()}
              </span>
              <span className="text-xs text-content-muted">{t(`installmentCounts.${key}`)}</span>
            </>
          );
          const box = 'block rounded-xl bg-surface-muted p-3';
          return (
            <li key={key}>
              {link ? (
                <Link
                  to={`/sales?${new URLSearchParams({ ...(projectId && { project: projectId }), sort: 'overdue', dir: 'desc' })}`}
                  className={`${box} hover:bg-primary-soft`}
                >
                  {body}
                </Link>
              ) : (
                <div className={box}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

InstallmentCounts.propTypes = {
  projectId: PropTypes.string,
  installments: PropTypes.shape({
    total: PropTypes.number,
    paid: PropTypes.number,
    due: PropTypes.number,
    overdue: PropTypes.number,
    upcoming: PropTypes.number,
  }).isRequired,
};
