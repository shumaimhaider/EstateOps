import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import DateOnly from '@/shared/ui/DateOnly.jsx';
import Money from '@/shared/ui/Money.jsx';
import { attemptShape } from '../domain/attempt.model.js';
import AttemptStatusPill from './AttemptStatusPill.jsx';
import FundsBadge from './FundsBadge.jsx';

/** Everything finance needs to know about one attempt, in words. */
function Why({ a }) {
  const { t } = useTranslation('collectionRuns');
  return (
    <div className="space-y-1 text-sm">
      <p>{a.summary}</p>
      <FundsBadge funds={a.funds} />
      {a.stripeCode && (
        <p className="text-xs text-content-muted">{t('stripeCode', { code: a.stripeCode })}</p>
      )}
      {a.status === 'failed' && (
        <p className="text-xs text-content-muted">
          {a.willRetry ? t('willRetry', { date: a.retryOn }) : t('noRetry')}
        </p>
      )}
    </div>
  );
}
Why.propTypes = { a: attemptShape.isRequired };

const Card = ({ a }) => {
  const { t } = useTranslation('collectionRuns');
  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{a.customerName}</p>
          <p className="text-xs text-content-muted">
            {a.invoiceNo} · {a.unitNo}
          </p>
        </div>
        <AttemptStatusPill status={a.status} />
      </div>
      <p className="mt-2 text-lg font-bold tabular-nums">
        <Money minor={a.amount.minor} currency={a.amount.currency} />
      </p>
      <div className="mt-2">
        <Why a={a} />
      </div>
      <p className="mt-2 text-xs text-content-muted">
        {a.cardLast4 ? `${a.cardBrand} •••• ${a.cardLast4} · ` : ''}
        {t('attempt', { no: a.attemptNo || 0 })}
      </p>
    </li>
  );
};
Card.propTypes = { a: attemptShape.isRequired };

/** Phones get a card per invoice; from the md breakpoint up the same rows are a table. */
export default function AttemptsList({ attempts }) {
  const { t } = useTranslation('collectionRuns');
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {attempts.map((a) => (
          <Card key={a.id} a={a} />
        ))}
      </ul>
      <div className="relative hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
        <table aria-label={t('title')} className="w-full text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wide text-content-muted">
            <tr>
              {['customer', 'invoice', 'amount', 'result', 'why', 'card'].map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={`px-4 py-3 text-start ${c === 'amount' ? 'text-end' : ''}`}
                >
                  {t(`columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border align-top">
            {attempts.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium">{a.customerName}</td>
                <td className="px-4 py-3">
                  {a.invoiceNo}
                  <span className="block text-xs text-content-muted">
                    {a.unitNo} · <DateOnly value={a.dueDate} />
                  </span>
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  <Money minor={a.amount.minor} currency={a.amount.currency} />
                </td>
                <td className="px-4 py-3">
                  <AttemptStatusPill status={a.status} />
                  <span className="mt-1 block text-xs text-content-muted">
                    {t(`reason.${a.reason}`, { defaultValue: '' })}{' '}
                    {a.attemptNo ? t('attempt', { no: a.attemptNo }) : ''}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Why a={a} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {a.cardLast4 ? `${a.cardBrand} •••• ${a.cardLast4}` : '—'}
                  {a.paymentIntentId && (
                    <span
                      className="block max-w-[11rem] truncate text-xs text-content-muted"
                      title={a.paymentIntentId}
                    >
                      {a.paymentIntentId}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
AttemptsList.propTypes = { attempts: PropTypes.arrayOf(attemptShape).isRequired };
