import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/index.js';
import { TransactionsTable } from '@/features/payments/index.js';
import PageHeader from '@/shared/ui/PageHeader.jsx';

/** Every card payment attempt across the tenant, with what Stripe answered. */
export default function TransactionsPage() {
  const { t } = useTranslation('payments');
  const canInspect = usePermission('payments.card');
  return (
    <div>
      <PageHeader title={t('transactions.title')} description={t('transactions.subtitle')} />
      <TransactionsTable canInspect={canInspect} />
    </div>
  );
}
