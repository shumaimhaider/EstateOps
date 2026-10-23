import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { useCreateRequestMutation } from '../hooks/support.hooks.js';
import MessageField from './MessageField.jsx';

/** Start a conversation, optionally about one property (`properties` = [{ id, label }]). */
export default function NewRequestDialog({
  open,
  properties,
  defaultBookingId,
  onClose,
  onCreated,
}) {
  const { t } = useTranslation('support');
  const create = useCreateRequestMutation();
  const schema = z.object({
    subject: z.string().trim().min(3, t('errors.subject')).max(120, t('errors.subjectLong')),
    message: z.string().trim().min(1, t('errors.message')).max(4000, t('errors.messageLong')),
    bookingId: z.string(),
  });
  const formik = useFormik({
    initialValues: { subject: '', message: '', bookingId: defaultBookingId ?? '' },
    enableReinitialize: true,
    validate: zodValidate(schema),
    onSubmit: async (values, helpers) => {
      try {
        const thread = await create.mutateAsync({
          subject: values.subject.trim(),
          message: values.message.trim(),
          bookingId: values.bookingId || undefined,
        });
        helpers.resetForm();
        onCreated(thread);
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
    <Dialog open={open} onClose={onClose} title={t('new.title')}>
      <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
        {formik.status?.formError && (
          <p role="alert" className="rounded-xl bg-tone-danger-bg p-3 text-sm text-tone-danger-fg">
            {formik.status.formError}
          </p>
        )}
        <TextField label={t('new.subject')} {...field('subject')} />
        {properties.length > 0 && (
          <div>
            <label htmlFor="support-property" className="mb-1 block text-sm font-medium">
              {t('new.property')}
            </label>
            <select
              id="support-property"
              className="w-full rounded-xl border border-border bg-surface p-2.5 text-sm"
              {...formik.getFieldProps('bookingId')}
            >
              <option value="">{t('new.generalQuestion')}</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <MessageField label={t('new.message')} {...field('message')} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('new.cancel')}
          </Button>
          <Button type="submit" loading={formik.isSubmitting}>
            {t('new.send')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
NewRequestDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  properties: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string.isRequired, label: PropTypes.string.isRequired }),
  ),
  defaultBookingId: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};
NewRequestDialog.defaultProps = { properties: [] };
