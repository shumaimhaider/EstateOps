import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react';
import Avatar from '@/shared/ui/Avatar.jsx';
import { LOGIN_PATH, ROLE_LABEL_KEYS } from '../domain/auth.constants.js';
import { useCurrentUser } from '../hooks/useSessionQuery.js';
import { useLogoutMutation } from '../hooks/useLogoutMutation.js';

/** Signed-in user card with sign-out. */
export default function UserMenu() {
  const { t } = useTranslation('auth');
  const user = useCurrentUser();
  const logout = useLogoutMutation();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3">
      <Avatar name={user.name} size="sm" />
      <div className="hidden min-w-0 sm:block">
        <p className="truncate text-sm font-semibold">{user.name}</p>
        <p className="truncate text-xs text-content-muted">
          {t(ROLE_LABEL_KEYS[user.role] ?? 'roles.unknown')} · {user.tenant.name}
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          logout.mutate(undefined, { onSettled: () => navigate(LOGIN_PATH, { replace: true }) })
        }
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium shadow-sm hover:bg-surface-muted"
      >
        <LogOut aria-hidden="true" className="size-4" />
        {t('signOut')}
      </button>
    </div>
  );
}
