import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { AREA_UNIT_KEYS } from '@/shared/lib/area.js';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import CheckboxField from '@/shared/ui/CheckboxField.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import SelectField from '@/shared/ui/SelectField.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { UNIT_KINDS } from '../domain/unit.constants.js';
import { projectShape } from '../domain/project.model.js';
import {
  createUnitFormSchema,
  initialUnitFormValues,
  toUnitDraft,
} from '../schemas/unitForm.schema.js';

/**
 * Create-unit form (Formik + Zod). Client validation runs first; server field errors (already
 * renamed to form fields by the repository) are applied inline on submit failure.
 * `onSubmit(draft)` must return a promise that rejects with the server error.
 */
export default function UnitFormDialog({ open, onClose, onSubmit, projects, currency, areaUnit }) {
  const { t } = useTranslation('inventory');
  const schema = useMemo(() => createUnitFormSchema({ currency, t }), [currency, t]);

  const formik = useFormik({
    initialValues: initialUnitFormValues({ areaUnit }),
    validate: zodValidate(schema),
    onSubmit: async (values, helpers) => {
      try {
        await onSubmit(toUnitDraft(values, currency));
        helpers.resetForm();
      } catch (error) {
        if (!applyServerErrors(helpers, error)) {
          helpers.setStatus({ formError: t('form.formError', { message: error.message }) });
        }
      }
    },
  });

  const err = (name) => (formik.touched[name] ? formik.errors[name] : undefined);
  const field = (name) => ({ ...formik.getFieldProps(name), error: err(name) });

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));
  const kindOptions = UNIT_KINDS.map((v) => ({ value: v, label: t(`kind.${v}`) }));
  const areaOptions = AREA_UNIT_KEYS.map((v) => ({
    value: v,
    label: t(`areaUnits.${v}`, { ns: 'common' }),
  }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('form.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={formik.isSubmitting}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button type="submit" form="unit-form" loading={formik.isSubmitting}>
            {t('form.submit')}
          </Button>
        </>
      }
    >
      <form
        id="unit-form"
        onSubmit={formik.handleSubmit}
        noValidate
        className="grid gap-3 sm:grid-cols-2"
      >
        {formik.status?.formError && (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {formik.status.formError}
          </p>
        )}
        <SelectField
          className="sm:col-span-2"
          label={t('form.project')}
          placeholder={t('form.projectPlaceholder')}
          options={projectOptions}
          {...field('projectId')}
        />
        <TextField label={t('form.unitNo')} {...field('unitNo')} />
        <SelectField label={t('form.kind')} options={kindOptions} {...field('kind')} />
        <TextField label={t('form.area')} inputMode="decimal" {...field('areaValue')} />
        <SelectField label={t('form.areaUnit')} options={areaOptions} {...field('areaUnit')} />
        <TextField label={t('form.bedrooms')} inputMode="numeric" {...field('bedrooms')} />
        <TextField label={t('form.parking')} inputMode="numeric" {...field('parkingSpaces')} />
        <TextField label={t('form.facing')} {...field('facing')} />
        <TextField label={t('form.view')} {...field('view')} />
        <TextField
          className="sm:col-span-2"
          label={t('form.price', { currency })}
          hint={t('form.priceHint')}
          inputMode="decimal"
          {...field('listPrice')}
        />
        <CheckboxField
          label={t('form.corner')}
          name="isCorner"
          checked={formik.values.isCorner}
          onChange={formik.handleChange}
        />
      </form>
    </Dialog>
  );
}

UnitFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  projects: PropTypes.arrayOf(projectShape).isRequired,
  currency: PropTypes.string.isRequired,
  areaUnit: PropTypes.string.isRequired,
};
