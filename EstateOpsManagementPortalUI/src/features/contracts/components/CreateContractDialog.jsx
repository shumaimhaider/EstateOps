import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import SelectField from '@/shared/ui/SelectField.jsx';
import { CONTRACT_TEMPLATES } from '../domain/contract.constants.js';

/** Start a contract in PandaDoc from a template; the buyer is the signer. */
export default function CreateContractDialog({ open, pending, onClose, onSubmit }) {
  const { t } = useTranslation('contracts');
  const [template, setTemplate] = useState(CONTRACT_TEMPLATES[0]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('create.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('create.cancel')}
          </Button>
          <Button loading={pending} onClick={() => onSubmit(template)}>
            {t('create.submit')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-content-muted">{t('create.intro')}</p>
      <SelectField
        label={t('create.template')}
        options={CONTRACT_TEMPLATES.map((value) => ({ value, label: t(`templates.${value}`) }))}
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
      />
    </Dialog>
  );
}

CreateContractDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  pending: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
