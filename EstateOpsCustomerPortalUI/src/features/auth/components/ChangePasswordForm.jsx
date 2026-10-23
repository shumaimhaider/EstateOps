import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import PasswordField from './PasswordField.jsx';
import { passwordRule } from './SetPasswordForm.jsx';

/** Change the password while signed in: current, new, new again. Signs the customer out everywhere on success. */
export default function ChangePasswordForm({ onSubmit }) {
  const { t } = useTranslation('auth');
  const schema = z
    .object({
      currentPassword: z.string().min(1, t('errors.currentPassword')),
      newPassword: passwordRule(t),
      confirm: z.string(),
    })
    .refine((v) => v.newPassword === v.confirm, {
      path: ['confirm'],
      message: t('errors.mismatch'),
    });
  const formik = useFormik({
    initialValues: { currentPassword: '', newPassword: '', confirm: '' },
    validate: zodValidate(schema),
    onSubmit: async (values, helpers) => {
      try {
        await onSubmit({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        });
      } catch (error) {
        if (!applyServerErrors(helpers, error)) helpers.setStatus({ formError: error.message });
      }
    },
  });
  const field = (name) => ({
    ...formik.getFieldProps(name),
    error: formik.touched[name] ? formik.errors[name] : undefined,
  });
  return (
    <form onSubmit={formik.handleSubmit} noValidate className="max-w-md space-y-4">
      {formik.status?.formError && (
        <p role="alert" className="rounded-xl bg-tone-danger-bg p-3 text-sm text-tone-danger-fg">
          {formik.status.formError}
        </p>
      )}
      <PasswordField label={t('currentPassword')} current {...field('currentPassword')} />
      <PasswordField label={t('newPassword')} hint={t('passwordHint')} {...field('newPassword')} />
      <PasswordField label={t('confirmPassword')} {...field('confirm')} />
      <Button type="submit" loading={formik.isSubmitting}>
        {t('changePassword')}
      </Button>
    </form>
  );
}
ChangePasswordForm.propTypes = { onSubmit: PropTypes.func.isRequired };
