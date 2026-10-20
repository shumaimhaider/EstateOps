import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '@/shared/lib/money.js';
import { useTenant } from '@/shared/lib/tenant.jsx';
import ChartCard from './ChartCard.jsx';
import { CHART_COLORS, compactMoney } from './chartFormat.js';

/** Overdue balance by days-late bucket (1-30, 31-60, 61-90, 90+). */
export default function AgeingChart({ ageing, currency }) {
  const { t } = useTranslation('collections');
  const { locale } = useTenant();
  const data = ageing.map((a) => ({
    bucket: t('charts.bucket', { bucket: a.bucket }),
    count: a.count,
    amountMinor: a.amount.minor,
  }));

  return (
    <ChartCard
      title={t('charts.ageing.title')}
      description={t('charts.ageing.description')}
      tableHeaders={[t('charts.daysLate'), t('charts.installments'), t('charts.overdueAmount')]}
      tableRows={data.map((d) => [
        d.bucket,
        String(d.count),
        formatMoney(d.amountMinor, currency, locale),
      ])}
    >
      <div className="h-72">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 480, height: 288 }}
        >
          <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="bucket"
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
            <Tooltip
              formatter={(v, name, item) => [
                `${formatMoney(v, currency, locale)} (${t('charts.count', { count: item.payload.count })})`,
                t('charts.overdueAmount'),
              ]}
              cursor={{ fill: CHART_COLORS.grid, opacity: 0.4 }}
            />
            <Bar
              isAnimationActive={false}
              dataKey="amountMinor"
              fill={CHART_COLORS.series1}
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            >
              <LabelList
                dataKey="amountMinor"
                position="top"
                formatter={(v) => compactMoney(v, currency, locale)}
                style={{ fill: CHART_COLORS.text, fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

AgeingChart.propTypes = {
  currency: PropTypes.string.isRequired,
  ageing: PropTypes.arrayOf(
    PropTypes.shape({
      bucket: PropTypes.string,
      count: PropTypes.number,
      amount: PropTypes.shape({ minor: PropTypes.number }),
    }),
  ).isRequired,
};
