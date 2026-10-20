import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Card from '@/shared/ui/Card.jsx';
import Money from '@/shared/ui/Money.jsx';
import ProgressBar from '@/shared/ui/ProgressBar.jsx';

/** Per-project money position: sale value, received, pending, overdue and % collected. */
export default function ProjectBreakdownTable({ projects }) {
  const { t } = useTranslation('collections');
  return (
    <Card
      as="section"
      aria-labelledby="project-breakdown"
      padded={false}
      className="overflow-hidden"
    >
      <div className="p-5 pb-3">
        <h2 id="project-breakdown" className="text-base font-semibold">
          {t('projectBreakdown.title')}
        </h2>
        <p className="text-sm text-content-muted">{t('projectBreakdown.description')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-labelledby="project-breakdown">
          <thead className="bg-surface-muted text-xs uppercase tracking-wide text-content-muted">
            <tr>
              <th scope="col" className="px-5 py-3 text-start">
                {t('projectBreakdown.project')}
              </th>
              <th scope="col" className="px-3 py-3 text-end">
                {t('projectBreakdown.sold')}
              </th>
              <th scope="col" className="px-3 py-3 text-end">
                {t('projectBreakdown.saleValue')}
              </th>
              <th scope="col" className="px-3 py-3 text-end">
                {t('projectBreakdown.received')}
              </th>
              <th scope="col" className="px-3 py-3 text-end">
                {t('projectBreakdown.pending')}
              </th>
              <th scope="col" className="px-3 py-3 text-end">
                {t('projectBreakdown.overdue')}
              </th>
              <th scope="col" className="px-5 py-3 text-start">
                {t('projectBreakdown.collected')}
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const pct =
                p.saleValue.minor === 0 ? 0 : (p.received.minor / p.saleValue.minor) * 100;
              return (
                <tr key={p.projectId} className="border-t border-border hover:bg-primary-soft/40">
                  <th scope="row" className="px-5 py-3 text-start font-semibold">
                    <Link className="hover:underline" to={`/inventory/projects/${p.projectId}`}>
                      {p.projectName}
                    </Link>
                  </th>
                  <td className="px-3 py-3 text-end tabular-nums">
                    <Link className="hover:underline" to={`/sales?project=${p.projectId}`}>
                      {p.unitsSold} / {p.unitsTotal}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-end">
                    <Money minor={p.saleValue.minor} currency={p.saleValue.currency} />
                  </td>
                  <td className="px-3 py-3 text-end">
                    <Money minor={p.received.minor} currency={p.received.currency} />
                  </td>
                  <td className="px-3 py-3 text-end">
                    <Money minor={p.pending.minor} currency={p.pending.currency} />
                  </td>
                  <td className="px-3 py-3 text-end font-semibold text-tone-danger-fg">
                    <Link
                      className="hover:underline"
                      to={`/sales?project=${p.projectId}&sort=overdue&dir=desc`}
                    >
                      <Money minor={p.overdue.minor} currency={p.overdue.currency} />
                    </Link>
                  </td>
                  <td className="min-w-40 px-5 py-3">
                    <p className="mb-1 text-xs tabular-nums">{Math.round(pct)}%</p>
                    <ProgressBar
                      value={pct}
                      label={t('projectBreakdown.collectedLabel', { name: p.projectName })}
                      tone="success"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

ProjectBreakdownTable.propTypes = {
  projects: PropTypes.arrayOf(
    PropTypes.shape({
      projectId: PropTypes.string,
      projectName: PropTypes.string,
      unitsSold: PropTypes.number,
      unitsTotal: PropTypes.number,
      saleValue: PropTypes.object,
      received: PropTypes.object,
      pending: PropTypes.object,
      overdue: PropTypes.object,
    }),
  ).isRequired,
};
