import { useTranslation } from 'react-i18next';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { INVOICE_STATUS_META } from '../domain/installment.constants.js';
import { isPartPaid } from '../domain/installment.rules.js';
import { invoiceShape } from '../domain/installment.model.js';

/** Status pill plus a "Part paid" badge and days-late text, so state never relies on colour alone. */
export default function InvoiceStatusPill({ invoice }) {
  const { t } = useTranslation('collections');
  const meta = INVOICE_STATUS_META[invoice.status];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusPill label={t(meta.labelKey)} tone={meta.tone} />
      {isPartPaid(invoice) && <StatusPill label={t('status.partPaid')} tone="info" />}
      {invoice.daysLate > 0 && (
        <span className="text-xs text-content-muted">
          {t('status.daysLate', { count: invoice.daysLate })}
        </span>
      )}
    </span>
  );
}

InvoiceStatusPill.propTypes = { invoice: invoiceShape.isRequired };
