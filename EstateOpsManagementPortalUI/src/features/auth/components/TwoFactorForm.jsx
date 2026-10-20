import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import TextField from '@/shared/ui/TextField.jsx';

/** Second step: the 6-digit code. Server errors (wrong code) show under the field. */
export default function TwoFactorForm({ onSubmit, onBack, hint }) {
  const { t } = useTranslation('auth');
  const schema = z.object({ code: z.string().regex(/^\d{6}$/, t('errors.code')) });
  const formik = useFormik({
    initialValues: { code: '' },
    validate: zodValidate(schema),
    onSubmit: async (values, helpers) => {
      try {
        await onSubmit(values.code);
      } catch (error) {
        if (!applyServerErrors(helpers, error)) helpers.setStatus({ formError: error.message });
      }
    },
  });
  return (
    <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
      <p className="text-sm text-content-muted">{t('twoFactorIntro')}</p>
      {formik.status?.formError && (
        <p role="alert" className="rounded-xl bg-tone-danger-bg p-3 text-sm text-tone-danger-fg">
          {formik.status.formError}
        </p>
      )}
      <TextField
        label={t('code')}
        inputMode="numeric"
        autoComplete="one-time-code"
        hint={hint}
        {...formik.getFieldProps('code')}
        error={formik.touched.code ? formik.errors.code : undefined}
      />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack} disabled={formik.isSubmitting}>
          {t('back')}
        </Button>
        <Button type="submit" className="flex-1" loading={formik.isSubmitting}>
          {t('verify')}
        </Button>
      </div>
    </form>
  );
}

TwoFactorForm.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  hint: PropTypes.string,
};
