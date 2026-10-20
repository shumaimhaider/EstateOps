import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Card from '@/shared/ui/Card.jsx';

/** Titled card around a chart, with a data-table view so values never depend on the graphic. */
export default function ChartCard({ title, description, children, tableHeaders, tableRows }) {
  const { t } = useTranslation();
  return (
    <Card as="section" aria-label={title}>
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="text-sm text-content-muted">{description}</p>}
      <div className="mt-4">{children}</div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-primary">
          {t('chart.viewTable')}
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table
            className="w-full text-start text-xs"
            aria-label={`${title} (${t('chart.table')})`}
          >
            <thead>
              <tr>
                {tableHeaders.map((h) => (
                  <th key={h} scope="col" className="p-1.5 text-start font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row[0]} className="border-t border-border">
                  {row.map((cell, i) => (
                    <td key={i} className="p-1.5 tabular-nums">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

ChartCard.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  children: PropTypes.node,
  tableHeaders: PropTypes.arrayOf(PropTypes.string).isRequired,
  tableRows: PropTypes.arrayOf(PropTypes.array).isRequired,
};
