import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ContractsList } from '@/features/contracts/index.js';
import { PayInvoiceDialog, TransactionsList } from '@/features/payments/index.js';
import {
  InvoiceTable,
  PropertyCard,
  useInvoicesQuery,
  usePropertyQuery,
} from '@/features/properties/index.js';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';

const TABS = ['schedule', 'contracts', 'payments'];

export default function PropertyPage() {
  const { t } = useTranslation();
  const { propertyId } = useParams();
  const property = usePropertyQuery(propertyId);
  const invoices = useInvoicesQuery(propertyId);
  const [tab, setTab] = useState('schedule');
  const [paying, setPaying] = useState(null);

  if (property.isPending) return <Skeleton rows={5} />;
  if (property.isError)
    return <ErrorState error={property.error} onRetry={() => property.refetch()} />;
  const p = property.data;
  return (
    <>
      <PageHeader
        title={`${p.projectName} · ${p.unitNo}`}
        backTo="/"
        backLabel={t('property.back')}
        actions={
          <Link className="text-sm text-primary underline" to={`/support?property=${p.id}`}>
            {t('property.contact')}
          </Link>
        }
      />
      <PropertyCard property={p} />
      <div role="tablist" aria-label={p.unitNo} className="mt-6 flex gap-1 border-b border-border">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === id ? 'border-primary text-primary' : 'border-transparent text-content-muted'}`}
          >
            {t(`property.tabs.${id}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-4">
        {tab === 'schedule' &&
          (invoices.isPending ? (
            <Skeleton rows={4} />
          ) : invoices.isError ? (
            <ErrorState error={invoices.error} onRetry={() => invoices.refetch()} />
          ) : (
            <InvoiceTable invoices={invoices.data} onPay={setPaying} />
          ))}
        {tab === 'contracts' && <ContractsList bookingId={p.id} />}
        {tab === 'payments' && <TransactionsList bookingId={p.id} />}
      </div>
      {paying && <PayInvoiceDialog invoice={paying} onClose={() => setPaying(null)} />}
    </>
  );
}
