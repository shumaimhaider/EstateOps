import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { createUploadFormSchema } from '../schemas/contractForms.schema.js';

/** Upload the contract the customer signed on paper (PDF). `onSubmit({ file, title })` rejects with the server error. */
export default function UploadContractDialog({ open, onClose, onSubmit }) {
  const { t } = useTranslation('contracts');
  const formik = useFormik({
    initialValues: { file: null, title: '' },
    validate: zodValidate(createUploadFormSchema(t)),
    onSubmit: async (values, helpers) => {
      try {
        await onSubmit({ file: values.file, title: values.title.trim() });
        helpers.resetForm();
      } catch (error) {
        if (!applyServerErrors(helpers, error)) {
          helpers.setStatus({ formError: t('upload.failed', { message: error.message }) });
        }
      }
    },
  });
  const touchedError = (name) => (formik.touched[name] ? formik.errors[name] : undefined);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('upload.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={formik.isSubmitting}>
            {t('upload.cancel')}
          </Button>
          <Button type="submit" form="upload-contract-form" loading={formik.isSubmitting}>
            {t('upload.submit')}
          </Button>
        </>
      }
    >
      <form
        id="upload-contract-form"
        onSubmit={formik.handleSubmit}
        noValidate
        className="grid gap-3"
      >
        <p className="text-sm text-content-muted">{t('upload.intro')}</p>
        {formik.status?.formError && (
          <p role="alert" className="text-sm text-danger">
            {formik.status.formError}
          </p>
        )}
        <TextField
          label={t('upload.file')}
          hint={t('upload.fileHint')}
          type="file"
          name="file"
          accept="application/pdf,.pdf"
          error={touchedError('file')}
          onBlur={formik.handleBlur}
          onChange={(e) => formik.setFieldValue('file', e.currentTarget.files?.[0] ?? null)}
        />
        <TextField
          label={t('upload.titleLabel')}
          {...formik.getFieldProps('title')}
          error={touchedError('title')}
        />
      </form>
    </Dialog>
  );
}

UploadContractDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
