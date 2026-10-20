import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Avatar from '@/shared/ui/Avatar.jsx';
import { ROLE_LABEL_KEYS } from '../domain/auth.constants.js';
import { devAccountShape } from '../domain/auth.model.js';

/** Mock mode: one seeded staff user per role and tenant, for one-click sign-in. */
export default function DevAccounts({ accounts, onPick, disabled }) {
  const { t } = useTranslation('auth');
  const tenants = [...new Set(accounts.map((a) => a.tenantName))];
  return (
    <details className="rounded-xl border border-border bg-surface-muted/60 p-3">
      <summary className="cursor-pointer text-sm font-semibold">{t('dev.title')}</summary>
      <p className="mt-2 text-xs text-content-muted">{t('dev.hint')}</p>
      {tenants.map((tenant) => (
        <section key={tenant} aria-label={tenant} className="mt-3">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-content-muted">
            {tenant}
          </h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            {accounts
              .filter((a) => a.tenantName === tenant)
              .map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(a)}
                    className="flex w-full items-center gap-2 rounded-lg p-2 text-start hover:bg-surface disabled:opacity-60"
                  >
                    <Avatar name={a.name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="block text-xs text-content-muted">
                        {t(ROLE_LABEL_KEYS[a.role])}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </details>
  );
}

DevAccounts.propTypes = {
  accounts: PropTypes.arrayOf(devAccountShape).isRequired,
  onPick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
