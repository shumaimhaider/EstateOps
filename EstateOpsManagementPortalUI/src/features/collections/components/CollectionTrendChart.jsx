import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMonth } from '@/shared/lib/dates.js';
import { formatMoney } from '@/shared/lib/money.js';
import { useTenant } from '@/shared/lib/tenant.jsx';
import ChartCard from './ChartCard.jsx';
import { CHART_COLORS, compactMoney } from './chartFormat.js';

/** Collected vs due by month. Receives pre-aggregated months from the API. */
export default function CollectionTrendChart({ byMonth, currency }) {
  const { t } = useTranslation('collections');
  const { locale } = useTenant();
  const data = byMonth.map((m) => ({ ...m, label: formatMonth(m.month) }));
  const fmt = (v) => formatMoney(v, currency, locale);

  return (
    <ChartCard
      title={t('charts.trend.title')}
      description={t('charts.trend.description')}
      tableHeaders={[t('charts.month'), t('charts.collected'), t('charts.due')]}
      tableRows={data.map((d) => [d.label, fmt(d.collectedMinor), fmt(d.dueMinor)])}
    >
      <div className="h-72">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 640, height: 288 }}
        >
          <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
              tickFormatter={(v) => compactMoney(v, currency, locale)}
            />
            <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: CHART_COLORS.grid, opacity: 0.4 }} />
            <Legend
              iconType="circle"
              formatter={(value) => <span className="text-content">{value}</span>}
            />
            <Bar
              isAnimationActive={false}
              dataKey="collectedMinor"
              name={t('charts.collected')}
              fill={CHART_COLORS.series1}
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
            <Bar
              isAnimationActive={false}
              dataKey="dueMinor"
              name={t('charts.due')}
              fill={CHART_COLORS.series2}
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

CollectionTrendChart.propTypes = {
  currency: PropTypes.string.isRequired,
  byMonth: PropTypes.arrayOf(
    PropTypes.shape({
      month: PropTypes.string,
      dueMinor: PropTypes.number,
      collectedMinor: PropTypes.number,
    }),
  ).isRequired,
};
