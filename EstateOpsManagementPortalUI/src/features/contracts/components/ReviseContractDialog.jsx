import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import Button from '@/shared/ui/Button.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { contractShape } from '../domain/contract.model.js';
import { createRevisionFormSchema } from '../schemas/contractForms.schema.js';

/** Revise an unsigned contract: the current version is voided and the next one opens as a draft. */
export default function ReviseContractDialog({ contract, onClose, onSubmit }) {
  const { t } = useTranslation('contracts');
  const formik = useFormik({
    initialValues: { note: '' },
    validate: zodValidate(createRevisionFormSchema(t)),
    onSubmit: async (values, helpers) => {
      try {
        await onSubmit({ contract, note: values.note.trim() });
        helpers.resetForm();
      } catch (error) {
        if (!applyServerErrors(helpers, error)) {
          helpers.setStatus({ formError: t('revise.failed', { message: error.message }) });
        }
      }
    },
  });
  return (
    <Dialog
      open={Boolean(contract)}
      onClose={onClose}
      title={t('revise.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={formik.isSubmitting}>
            {t('revise.cancel')}
          </Button>
          <Button type="submit" form="revise-contract-form" loading={formik.isSubmitting}>
            {t('revise.submit')}
          </Button>
        </>
      }
    >
      <form
        id="revise-contract-form"
        onSubmit={formik.handleSubmit}
        noValidate
        className="grid gap-3"
      >
        <p className="text-sm text-content-muted">
          {t('revise.intro', { title: contract?.title, version: contract?.version })}
        </p>
        {formik.status?.formError && (
          <p role="alert" className="text-sm text-danger">
            {formik.status.formError}
          </p>
        )}
        <TextField
          label={t('revise.note')}
          hint={t('revise.noteHint')}
          {...formik.getFieldProps('note')}
          error={formik.touched.note ? formik.errors.note : undefined}
        />
      </form>
    </Dialog>
  );
}

ReviseContractDialog.propTypes = {
  contract: contractShape,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
