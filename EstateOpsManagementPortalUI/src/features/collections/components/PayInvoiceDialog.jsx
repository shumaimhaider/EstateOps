import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/shared/lib/money.js';
import { useTenant } from '@/shared/lib/tenant.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import SelectField from '@/shared/ui/SelectField.jsx';
import { canMarkReceived, canPayByCard } from '../domain/installment.rules.js';
import { invoiceShape } from '../domain/installment.model.js';
import PaymentForm from './PaymentForm.jsx';

/**
 * Take a payment on a customer's behalf: mark it received, pay on Stripe's card form, or charge the
 * customer's saved card. `invoices` are the payable choices: one invoice from a row action, or all of
 * a customer's unpaid invoices. `onSubmit({ mode, payment, saveCard })` must reject with the server
 * error so field errors show inline. When a card checkout is open, `checkout` is set and
 * `renderCheckout(checkout)` supplies the embedded Stripe form in place of the form.
 */
export default function PayInvoiceDialog({
  open,
  invoices,
  initialInvoiceId,
  savedCard = null,
  checkout = null,
  renderCheckout = () => null,
  onClose,
  onSubmit,
}) {
  const { t } = useTranslation('collections');
  const { locale } = useTenant();
  const [chosen, setChosen] = useState(null);
  const [chosenMode, setChosenMode] = useState('manual');

  const selected =
    invoices.find((i) => i.id === (chosen ?? initialInvoiceId)) ?? invoices[0] ?? null;
  const modes = selected
    ? [
        canMarkReceived(selected) && 'manual',
        canPayByCard(selected) && 'card',
        canPayByCard(selected) && savedCard && 'saved',
      ].filter(Boolean)
    : [];
  const mode = modes.includes(chosenMode) ? chosenMode : modes[0];
  const currency = selected?.balance.currency ?? 'PKR';

  return (
    <Dialog open={open && Boolean(selected)} onClose={onClose} title={t('pay.title')}>
      {checkout && <div className="pt-1">{renderCheckout(checkout)}</div>}
      {!checkout && selected && mode && (
        <>
          <p className="mb-4 rounded-xl bg-primary-soft p-3 text-sm">
            {t('pay.summary', {
              buyer: selected.buyerName,
              invoice: selected.invoiceNo,
              unit: selected.unitNo,
              balance: formatMoney(selected.balance.minor, currency, locale),
            })}
          </p>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            {invoices.length > 1 && (
              <SelectField
                className="sm:col-span-2"
                label={t('pay.invoice')}
                options={invoices.map((i) => ({
                  value: i.id,
                  label: t('pay.invoiceOption', {
                    invoice: i.invoiceNo,
                    unit: i.unitNo,
                    balance: formatMoney(i.balance.minor, currency, locale),
                  }),
                }))}
                name="invoiceId"
                value={selected.id}
                onChange={(e) => setChosen(e.target.value)}
              />
            )}
            {modes.length > 1 && (
              <fieldset className="flex gap-4 sm:col-span-2">
                <legend className="mb-1.5 text-sm font-medium">{t('pay.type')}</legend>
                {modes.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="paymentType"
                      value={m}
                      checked={mode === m}
                      onChange={() => setChosenMode(m)}
                    />
                    {t(`pay.types.${m}`)}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
          <PaymentForm
            key={`${selected.id}-${mode}`}
            invoice={selected}
            mode={mode}
            savedCardLabel={
              savedCard
                ? t('pay.saved.with', {
                    brand: savedCard.brand.charAt(0).toUpperCase() + savedCard.brand.slice(1),
                    last4: savedCard.last4,
                  })
                : undefined
            }
            onCancel={onClose}
            onSubmit={(values) => onSubmit({ mode, ...values })}
          />
        </>
      )}
    </Dialog>
  );
}

PayInvoiceDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  invoices: PropTypes.arrayOf(invoiceShape).isRequired,
  initialInvoiceId: PropTypes.string,
  savedCard: PropTypes.shape({ brand: PropTypes.string, last4: PropTypes.string }),
  checkout: PropTypes.object,
  renderCheckout: PropTypes.func,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
