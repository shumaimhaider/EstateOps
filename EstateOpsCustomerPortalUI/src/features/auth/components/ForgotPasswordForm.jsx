import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import TextField from '@/shared/ui/TextField.jsx';

/** Asks for a reset link. The answer is the same for every address, so nothing here reveals who is a customer. */
export default function ForgotPasswordForm({
  onSubmit,
  tenant = '',
  tenantFixed = false,
  email = '',
}) {
  const { t } = useTranslation('auth');
  const schema = z.object({
    tenant: z.string().trim().min(1, t('errors.tenant')),
    email: z.email(t('errors.email')),
  });
  const formik = useFormik({
    initialValues: { tenant, email },
    validate: zodValidate(schema),
    onSubmit: async (values, helpers) => {
      try {
        await onSubmit({ ...values, tenant: values.tenant.trim().toLowerCase() });
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
    <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
      {formik.status?.formError && (
        <p role="alert" className="rounded-xl bg-tone-danger-bg p-3 text-sm text-tone-danger-fg">
          {formik.status.formError}
        </p>
      )}
      {!tenantFixed && (
        <TextField
          label={t('tenant')}
          hint={t('tenantHint')}
          autoCapitalize="none"
          {...field('tenant')}
        />
      )}
      <TextField label={t('email')} type="email" autoComplete="username" {...field('email')} />
      <Button type="submit" className="w-full" loading={formik.isSubmitting}>
        {t('sendLink')}
      </Button>
    </form>
  );
}
ForgotPasswordForm.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  tenant: PropTypes.string,
  tenantFixed: PropTypes.bool,
  email: PropTypes.string,
};
