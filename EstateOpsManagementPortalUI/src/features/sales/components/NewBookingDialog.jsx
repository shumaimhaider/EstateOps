import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import { formatMoney } from '@/shared/lib/money.js';
import { useDebouncedValue } from '@/shared/lib/useDebouncedValue.js';
import { useTenant } from '@/shared/lib/tenant.jsx';
import Button from '@/shared/ui/Button.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import SelectField from '@/shared/ui/SelectField.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { createNewBookingSchema } from '../schemas/newBooking.schema.js';
import {
  useCreateBookingMutation,
  useCustomerChoices,
  usePlanChoices,
  useUnitChoices,
} from '../hooks/useNewBooking.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Book a unit for a customer on a payment plan. `unit` (optional) fixes the unit, as when opened from
 * a unit's own page. The server finishes the booking in a few seconds; `onCreated(booking)` fires
 * as soon as it is accepted.
 */
export default function NewBookingDialog({ open, onClose, onCreated, unit = null }) {
  const { t } = useTranslation('sales');
  const { locale } = useTenant();
  const create = useCreateBookingMutation();
  const [unitText, setUnitText] = useState('');
  const [customerText, setCustomerText] = useState('');
  const units = useUnitChoices(useDebouncedValue(unitText));
  const customers = useCustomerChoices(useDebouncedValue(customerText));
  const plans = usePlanChoices();
  const today = todayIso();
  const schema = useMemo(() => createNewBookingSchema({ t, today }), [t, today]);

  const formik = useFormik({
    initialValues: { unitId: unit?.id ?? '', customerId: '', planId: '', bookedAt: '' },
    enableReinitialize: true,
    validate: zodValidate(schema),
    onSubmit: async (values, helpers) => {
      try {
        const booking = await create.mutateAsync(values);
        helpers.resetForm();
        onCreated(booking);
      } catch (error) {
        if (!applyServerErrors(helpers, error)) {
          helpers.setStatus({ formError: t('new.failed', { message: error.message }) });
        }
      }
    },
  });
  const field = (name) => ({
    ...formik.getFieldProps(name),
    error: formik.touched[name] ? formik.errors[name] : undefined,
  });

  const unitOptions = (units.data ?? []).map((u) => ({
    value: u.id,
    label: t('new.unitOption', {
      unit: u.unitNo,
      project: u.projectName,
      price: formatMoney(u.price.minor, u.price.currency, locale),
    }),
  }));
  const customerOptions = (customers.data ?? []).map((c) => ({
    value: c.id,
    label: c.email ? `${c.name} · ${c.email}` : c.name,
  }));
  const planOptions = (plans.data ?? []).map((p) => ({
    value: p.id,
    label: t('new.planOption', { name: p.name, down: p.downPct, count: p.installments }),
  }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('new.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={formik.isSubmitting}>
            {t('new.cancel')}
          </Button>
          <Button type="submit" form="new-booking-form" loading={formik.isSubmitting}>
            {t('new.submit')}
          </Button>
        </>
      }
    >
      <form id="new-booking-form" onSubmit={formik.handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-content-muted">{t('new.intro')}</p>
        {formik.status?.formError && (
          <p role="alert" className="rounded-xl bg-tone-danger-bg p-3 text-sm text-tone-danger-fg">
            {formik.status.formError}
          </p>
        )}

        {unit ? (
          <p className="rounded-xl bg-surface-muted p-3 text-sm">
            <span className="block text-xs text-content-muted">{t('new.unit')}</span>
            <strong>{t('new.unitFixed', { unit: unit.unitNo, project: unit.projectName })}</strong>
          </p>
        ) : (
          <fieldset className="space-y-2">
            <TextField
              label={t('new.findUnit')}
              value={unitText}
              onChange={(e) => setUnitText(e.target.value)}
              placeholder={t('new.findUnitHint')}
            />
            <SelectField
              label={t('new.unit')}
              placeholder={units.isPending ? t('new.loading') : t('new.chooseUnit')}
              options={unitOptions}
              {...field('unitId')}
            />
            {units.isSuccess && unitOptions.length === 0 && (
              <p className="text-xs text-content-muted">{t('new.noUnits')}</p>
            )}
          </fieldset>
        )}

        <fieldset className="space-y-2">
          <TextField
            label={t('new.findCustomer')}
            value={customerText}
            onChange={(e) => setCustomerText(e.target.value)}
            placeholder={t('new.findCustomerHint')}
          />
          <SelectField
            label={t('new.customer')}
            placeholder={customers.isPending ? t('new.loading') : t('new.chooseCustomer')}
            options={customerOptions}
            {...field('customerId')}
          />
        </fieldset>

        <SelectField
          label={t('new.plan')}
          placeholder={plans.isPending ? t('new.loading') : t('new.choosePlan')}
          options={planOptions}
          {...field('planId')}
        />
        {plans.isSuccess && planOptions.length === 0 && (
          <p className="text-xs text-content-muted">{t('new.noPlans')}</p>
        )}
        <TextField
          label={t('new.bookedAt')}
          hint={t('new.bookedAtHint')}
          type="date"
          max={today}
          {...field('bookedAt')}
        />
      </form>
    </Dialog>
  );
}

NewBookingDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
  unit: PropTypes.shape({
    id: PropTypes.string.isRequired,
    unitNo: PropTypes.string.isRequired,
    projectName: PropTypes.string,
  }),
};
