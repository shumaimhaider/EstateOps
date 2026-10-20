import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Card from '@/shared/ui/Card.jsx';

const SEGMENTS = [
  { status: 'sold', bar: 'bg-tone-accent-fg' },
  { status: 'booked', bar: 'bg-tone-info-fg' },
  { status: 'available', bar: 'bg-tone-success-fg' },
  { status: 'held', bar: 'bg-tone-warning-fg' },
  { status: 'blocked', bar: 'bg-tone-neutral-fg' },
];

const unitsLink = (kind, status, projectId) => {
  const params = new URLSearchParams({ kind });
  if (status) params.set('status', status);
  if (projectId) params.set('project', projectId);
  return `/inventory/units?${params}`;
};

/**
 * Units by type (plots, flats, villas, shops): sold vs unsold. Every count links to the
 * Units list filtered to that type and status.
 */
export default function InventoryByType({ unitsByKind, projectId = '' }) {
  const { t } = useTranslation('collections');
  return (
    <Card as="section" aria-labelledby="inventory-by-type">
      <h2 id="inventory-by-type" className="text-base font-semibold">
        {t('inventoryByType.title')}
      </h2>
      <p className="mb-4 text-sm text-content-muted">{t('inventoryByType.description')}</p>
      <ul className="space-y-5">
        {unitsByKind.map((row) => (
          <li key={row.kind}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <Link
                to={unitsLink(row.kind, '', projectId)}
                className="font-semibold hover:text-primary hover:underline"
              >
                {t(`unitKindPlural.${row.kind}`)}
                <span className="ms-2 text-sm font-normal text-content-muted">
                  {t('inventoryByType.total', { count: row.total })}
                </span>
              </Link>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {SEGMENTS.map(({ status }) => (
                  <Link
                    key={status}
                    to={unitsLink(row.kind, status, projectId)}
                    className="tabular-nums hover:text-primary hover:underline"
                  >
                    <span className="font-semibold">{row[status]}</span>{' '}
                    <span className="text-content-muted">{t(`unitStatus.${status}`)}</span>
                  </Link>
                ))}
              </p>
            </div>
            <div
              role="img"
              aria-label={t('inventoryByType.barLabel', {
                kind: t(`unitKindPlural.${row.kind}`),
                sold: row.sold,
                unsold: row.available,
              })}
              className="flex h-3 overflow-hidden rounded-full bg-surface-muted"
            >
              {SEGMENTS.map(({ status, bar }) => (
                <span key={status} className={`h-full ${bar}`} style={{ flexGrow: row[status] }} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

InventoryByType.propTypes = {
  projectId: PropTypes.string,
  unitsByKind: PropTypes.arrayOf(
    PropTypes.shape({
      kind: PropTypes.string.isRequired,
      total: PropTypes.number.isRequired,
      available: PropTypes.number.isRequired,
      sold: PropTypes.number.isRequired,
    }),
  ).isRequired,
};
