import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import PasswordField from './PasswordField.jsx';

/**
 * Developer (tenant), email and password. When the portal is set up for one developer the
 * developer field is hidden. `onSubmit` must reject with the server error to show it inline.
 */
export default function LoginForm({ onSubmit, tenant = '', tenantFixed = false, email = '' }) {
  const { t } = useTranslation('auth');
  const schema = z.object({
    tenant: z.string().trim().min(1, t('errors.tenant')),
    email: z.email(t('errors.email')),
    password: z.string().min(1, t('errors.password')),
  });
  const formik = useFormik({
    initialValues: { tenant, email, password: '' },
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
          autoComplete="organization"
          {...field('tenant')}
        />
      )}
      <TextField label={t('email')} type="email" autoComplete="username" {...field('email')} />
      <PasswordField label={t('password')} current {...field('password')} />
      <Button type="submit" className="w-full" loading={formik.isSubmitting}>
        {t('signIn')}
      </Button>
      <p className="text-center text-sm">
        <Link
          to="/forgot-password"
          state={{ tenant: formik.values.tenant, email: formik.values.email }}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {t('forgot')}
        </Link>
      </p>
    </form>
  );
}

LoginForm.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  tenant: PropTypes.string,
  tenantFixed: PropTypes.bool,
  email: PropTypes.string,
};
