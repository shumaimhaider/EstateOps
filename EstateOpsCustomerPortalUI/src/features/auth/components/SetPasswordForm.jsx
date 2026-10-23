import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import PasswordField from './PasswordField.jsx';

/** The rule the server enforces too: 8 to 128 characters with a letter and a digit. */
export const passwordRule = (t, message) =>
  z
    .string()
    .min(8, message ?? t('errors.passwordRule'))
    .max(128, message ?? t('errors.passwordRule'))
    .regex(/[A-Za-z]/, message ?? t('errors.passwordRule'))
    .regex(/\d/, message ?? t('errors.passwordRule'));

/** Choose a password (from an invitation or reset link): new password typed twice. */
export default function SetPasswordForm({ onSubmit, submitLabel }) {
  const { t } = useTranslation('auth');
  const schema = z
    .object({ password: passwordRule(t), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('errors.mismatch') });
  const formik = useFormik({
    initialValues: { password: '', confirm: '' },
    validate: zodValidate(schema),
    onSubmit: async (values, helpers) => {
      try {
        await onSubmit({ password: values.password });
      } catch (error) {
        if (!applyServerErrors(helpers, error))
          helpers.setStatus({ formError: error.fieldErrors?.token ?? error.message });
        else if (error.fieldErrors?.token)
          helpers.setStatus({ formError: error.fieldErrors.token });
      }
    },
  });
  const field = (name) => ({
    ...formik.getFieldProps(name),
    error: formik.touched[name] ? formik.errors[name] : undefined,
  });
  return (
    <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
      {formik.status?.formError && (
        <p role="alert" className="rounded-xl bg-tone-danger-bg p-3 text-sm text-tone-danger-fg">
          {formik.status.formError}
        </p>
      )}
      <PasswordField label={t('newPassword')} hint={t('passwordHint')} {...field('password')} />
      <PasswordField label={t('confirmPassword')} {...field('confirm')} />
      <Button type="submit" className="w-full" loading={formik.isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
SetPasswordForm.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  submitLabel: PropTypes.string.isRequired,
};
