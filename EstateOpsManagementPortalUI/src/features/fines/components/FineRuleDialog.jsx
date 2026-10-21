import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import SelectField from '@/shared/ui/SelectField.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { FINE_KINDS } from '../domain/fineRule.constants.js';
import { fineRuleShape } from '../domain/fineRule.model.js';
import {
  createFineRuleFormSchema,
  initialFineValues,
  toRule,
} from '../schemas/fineRuleForm.schema.js';

/** Set the fine rate at one level. `onSubmit(rule)` must reject with the server error. */
export default function FineRuleDialog({
  open,
  scope,
  scopeId,
  unitKind,
  current,
  currency,
  onClose,
  onSubmit,
}) {
  const { t } = useTranslation('fines');
  const formik = useFormik({
    enableReinitialize: true,
    initialValues: initialFineValues(current),
    validate: zodValidate(createFineRuleFormSchema({ currency, t })),
    onSubmit: async (values, helpers) => {
      try {
        await onSubmit(toRule(values, { scope, scopeId, unitKind, currency }));
      } catch (error) {
        if (!applyServerErrors(helpers, error)) {
          helpers.setStatus({ formError: t('form.failed', { message: error.message }) });
        }
      }
    },
  });
  const err = (name) => (formik.touched[name] ? formik.errors[name] : undefined);
  const field = (name) => ({ ...formik.getFieldProps(name), error: err(name) });
  const percent = formik.values.kind === 'percent';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        unitKind
          ? t('form.titleCategory', {
              level: t(`scopes.${scope}`),
              category: t(`categories.${unitKind}`),
            })
          : t(`form.title.${scope}`)
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={formik.isSubmitting}>
            {t('form.cancel')}
          </Button>
          <Button type="submit" form="fine-rule-form" loading={formik.isSubmitting}>
            {t('form.save')}
          </Button>
        </>
      }
    >
      <form id="fine-rule-form" onSubmit={formik.handleSubmit} noValidate className="grid gap-3">
        {formik.status?.formError && (
          <p role="alert" className="text-sm text-danger">
            {formik.status.formError}
          </p>
        )}
        <SelectField
          label={t('form.kind')}
          options={FINE_KINDS.map((value) => ({ value, label: t(`form.kinds.${value}`) }))}
          {...field('kind')}
        />
        {percent ? (
          <TextField
            label={t('form.percent')}
            hint={t('form.percentHint')}
            inputMode="decimal"
            {...field('percent')}
          />
        ) : (
          <TextField
            label={t('form.amount', { currency })}
            hint={t('form.amountHint')}
            inputMode="decimal"
            {...field('amount')}
          />
        )}
      </form>
    </Dialog>
  );
}

FineRuleDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  scope: PropTypes.oneOf(['default', 'project', 'unit', 'customer']).isRequired,
  scopeId: PropTypes.string,
  unitKind: PropTypes.string,
  current: fineRuleShape,
  currency: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
