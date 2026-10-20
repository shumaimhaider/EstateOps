import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import TextField from '@/shared/ui/TextField.jsx';

/** Email + password step. `onSubmit` must reject with the server error to show it inline. */
export default function LoginForm({ onSubmit, initialEmail = '' }) {
  const { t } = useTranslation('auth');
  const schema = z.object({
    email: z.email(t('errors.email')),
    password: z.string().min(1, t('errors.password')),
  });
  const formik = useFormik({
    initialValues: { email: initialEmail, password: '' },
    validate: zodValidate(schema),
    onSubmit: async (values, helpers) => {
      try {
        await onSubmit(values);
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
      <TextField label={t('email')} type="email" autoComplete="username" {...field('email')} />
      <TextField
        label={t('password')}
        type="password"
        autoComplete="current-password"
        {...field('password')}
      />
      <Button type="submit" className="w-full" loading={formik.isSubmitting}>
        {t('continue')}
      </Button>
    </form>
  );
}

LoginForm.propTypes = { onSubmit: PropTypes.func.isRequired, initialEmail: PropTypes.string };
