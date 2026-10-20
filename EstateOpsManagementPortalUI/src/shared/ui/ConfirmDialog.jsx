import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';

/** Every destructive or money-moving action confirms and states its impact in `message`. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  pending = false,
  danger = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            {t('actions.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={pending}>
            {confirmLabel ?? t('actions.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm">{message}</p>
    </Dialog>
  );
}

ConfirmDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  confirmLabel: PropTypes.string,
  pending: PropTypes.bool,
  danger: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
