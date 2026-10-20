import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Avatar from '@/shared/ui/Avatar.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import GoogleIcon from '@/shared/ui/GoogleIcon.jsx';
import { devAccountShape } from '../domain/auth.model.js';

const UNREGISTERED = 'someone.else@gmail.com';

/** Mock-mode stand-in for Google's account chooser. Picks produce a mock Google id token. */
export default function MockGoogleChooser({ open, accounts, onPick, onClose }) {
  const { t } = useTranslation('auth');
  return (
    <Dialog open={open} onClose={onClose} title={t('google.chooserTitle')}>
      <p className="mb-4 flex items-center gap-2 text-sm text-content-muted">
        <GoogleIcon /> {t('google.chooserHint')}
      </p>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {accounts.map((a) => (
          <li key={a.email}>
            <button
              type="button"
              onClick={() => onPick(a.email)}
              className="flex w-full items-center gap-3 p-3 text-start hover:bg-surface-muted"
            >
              <Avatar name={a.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{a.name}</span>
                <span className="block truncate text-xs text-content-muted">{a.email}</span>
              </span>
              <span className="text-xs text-content-muted">{a.tenantName}</span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => onPick(UNREGISTERED)}
            className="w-full p-3 text-start text-sm text-content-muted hover:bg-surface-muted"
          >
            {t('google.unregistered', { email: UNREGISTERED })}
          </button>
        </li>
      </ul>
    </Dialog>
  );
}

MockGoogleChooser.propTypes = {
  open: PropTypes.bool.isRequired,
  accounts: PropTypes.arrayOf(devAccountShape).isRequired,
  onPick: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
