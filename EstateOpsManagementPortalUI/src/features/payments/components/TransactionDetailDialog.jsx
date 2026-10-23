import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Dialog from '@/shared/ui/Dialog.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Money from '@/shared/ui/Money.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useTransactionQuery } from '../hooks/useTransactions.js';
import TransactionStatusPill from './TransactionStatusPill.jsx';

const Row = ({ label, children }) =>
  children ? (
    <div>
      <dt className="text-xs text-content-muted">{label}</dt>
      <dd className="break-all text-sm">{children}</dd>
    </div>
  ) : null;
Row.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node };

/** One transaction with its Stripe references and the answer Stripe sent, for finance to inspect. */
export default function TransactionDetailDialog({ transactionId, onClose }) {
  const { t } = useTranslation('payments');
  const query = useTransactionQuery(transactionId);
  const tx = query.data;
  return (
    <Dialog open={Boolean(transactionId)} onClose={onClose} title={t('transactions.detailTitle')}>
      {query.isPending && <Skeleton rows={4} />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {tx && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <p className="text-lg font-semibold">
              <Money minor={tx.amount.minor} currency={tx.amount.currency} />
            </p>
            <TransactionStatusPill status={tx.status} />
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label={t('transactions.columns.how')}>
              {t(`transactions.trigger.${tx.trigger}`)}
            </Row>
            <Row label={t('transactions.columns.card')}>
              {tx.cardLast4 ? `${tx.cardBrand} •••• ${tx.cardLast4}` : null}
            </Row>
            <Row label={t('transactions.columns.reason')}>{tx.failureMessage}</Row>
            <Row label={t('transactions.paymentIntent')}>{tx.paymentIntentId}</Row>
            <Row label={t('transactions.charge')}>{tx.chargeId}</Row>
            <Row label={t('transactions.refund')}>{tx.refundId}</Row>
          </dl>
          <section aria-labelledby="stripe-response">
            <h3 id="stripe-response" className="mb-1 text-sm font-semibold">
              {t('transactions.stripeResponse')}
            </h3>
            <pre className="max-h-72 overflow-auto rounded-xl bg-surface-muted p-3 text-xs">
              {JSON.stringify(tx.stripeResponse, null, 2)}
            </pre>
          </section>
        </div>
      )}
    </Dialog>
  );
}

TransactionDetailDialog.propTypes = {
  transactionId: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};
