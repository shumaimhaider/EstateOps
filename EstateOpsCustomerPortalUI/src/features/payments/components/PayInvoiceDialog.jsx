import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import CheckboxField from '@/shared/ui/CheckboxField.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { formatMoney, minorToMajorInput, parseMajorToMinor } from '@/shared/lib/money.js';
import { getErrorInfo } from '@/shared/lib/errors.js';
import { useTenant } from '@/shared/lib/tenant.jsx';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import { invoiceShape } from '../domain/payment.model.js';
import {
  useCardsQuery,
  useChargeSavedCardMutation,
  useStartCheckoutMutation,
} from '../hooks/payments.hooks.js';
import CheckoutPanel from './CheckoutPanel.jsx';

const brandName = (b) => b.charAt(0).toUpperCase() + b.slice(1);

/**
 * Pay an invoice: the whole balance or part of it, with the saved card or on Stripe's own form.
 * The card is only ever typed into Stripe's form. `onPaid()` is called when the dialog is done.
 */
export default function PayInvoiceDialog({ invoice, onClose }) {
  const { t } = useTranslation('payments');
  const { locale } = useTenant();
  const toast = useToast();
  const cards = useCardsQuery();
  const saved = cards.data?.find((c) => c.isActive && !c.expired) ?? null;
  const expiredOnly = !saved && cards.data?.some((c) => c.isActive && c.expired);
  const startCheckout = useStartCheckoutMutation();
  const chargeSaved = useChargeSavedCardMutation();
  const [text, setText] = useState(() =>
    invoice ? minorToMajorInput(invoice.balance.minor, invoice.balance.currency) : '',
  );
  const [mode, setMode] = useState('saved');
  const [keep, setKeep] = useState(false);
  const [problem, setProblem] = useState('');
  const [checkout, setCheckout] = useState(null);

  if (!invoice) return null;
  const currency = invoice.balance.currency;
  const via = saved && mode === 'saved' ? 'saved' : 'form';
  const minor = parseMajorToMinor(text, currency);
  const valid = minor !== null && minor > 0 && minor <= invoice.balance.minor;

  const submit = async (event) => {
    event.preventDefault();
    if (!valid) {
      setProblem(t('pay.amountError'));
      return;
    }
    setProblem('');
    const payment = { amountMinor: minor === invoice.balance.minor ? undefined : minor };
    try {
      if (via === 'saved') {
        const tx = await chargeSaved.mutateAsync({ invoiceId: invoice.id, payment });
        if (tx.status !== 'succeeded') {
          setProblem(t('pay.failed', { message: tx.failureMessage ?? '' }));
          return;
        }
        toast.show({ tone: 'success', message: t('pay.paid', { invoice: invoice.invoiceNo }) });
        onClose();
        return;
      }
      setCheckout(
        await startCheckout.mutateAsync({ invoiceId: invoice.id, payment, saveCard: keep }),
      );
    } catch (error) {
      setProblem(getErrorInfo(error).fieldErrors.amount ?? getErrorInfo(error).message);
    }
  };

  return (
    <Dialog open onClose={onClose} title={t('pay.title', { invoice: invoice.invoiceNo })}>
      {checkout ? (
        <CheckoutPanel checkout={checkout} onCancel={onClose} onFinished={onClose} />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <p className="rounded-xl bg-primary-soft p-3 text-sm">
            {t('pay.summary', {
              invoice: invoice.invoiceNo,
              due: invoice.dueDate,
              balance: formatMoney(invoice.balance.minor, currency, locale),
            })}
          </p>
          {problem && (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          )}
          <TextField
            label={t('pay.amount', { currency })}
            hint={t('pay.amountHint')}
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {(saved || expiredOnly) && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">{t('pay.method')}</legend>
              {saved ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="how"
                    checked={mode === 'saved'}
                    onChange={() => setMode('saved')}
                  />
                  {t('pay.withSaved', { brand: brandName(saved.brand), last4: saved.last4 })}
                </label>
              ) : (
                <p className="text-sm text-content-muted">{t('pay.expiredCard')}</p>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="how"
                  checked={via === 'form'}
                  disabled={!saved}
                  onChange={() => setMode('form')}
                />
                {t('pay.withNew')}
              </label>
            </fieldset>
          )}
          {via === 'form' && (
            <CheckboxField
              label={t('pay.saveCard')}
              checked={keep}
              onChange={(e) => setKeep(e.target.checked)}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={chargeSaved.isPending || startCheckout.isPending}
            >
              {t('pay.cancel')}
            </Button>
            <Button type="submit" loading={chargeSaved.isPending || startCheckout.isPending}>
              {via === 'saved'
                ? t('pay.payNow', {
                    amount: valid ? formatMoney(minor, currency, locale) : '',
                  }).trim()
                : t('pay.continue')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
PayInvoiceDialog.propTypes = { invoice: invoiceShape, onClose: PropTypes.func.isRequired };
