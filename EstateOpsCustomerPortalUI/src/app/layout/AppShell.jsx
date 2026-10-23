import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from 'react-error-boundary';
import { Building2, LogOut } from 'lucide-react';
import { useCurrentCustomer, useLogoutMutation } from '@/features/auth/index.js';
import { reportError } from '@/shared/lib/errorReporter.js';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import RootFallback from '../errors/RootFallback.jsx';
import { NAV_ITEMS } from '../router/nav.js';

const LINK =
  'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-content-muted hover:bg-surface-muted';

/** Top bar with the developer's name, the three sections and sign-out; pages render below. */
export default function AppShell() {
  const { t } = useTranslation();
  const customer = useCurrentCustomer();
  const logout = useLogoutMutation();
  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-2"
      >
        {t('app.skipToContent')}
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="flex items-center gap-2 font-bold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-white">
              <Building2 aria-hidden="true" className="size-4" />
            </span>
            {customer?.tenant.name}
          </p>
          <nav
            aria-label={t('nav.main')}
            className="order-last flex w-full gap-1 sm:order-none sm:w-auto"
          >
            {NAV_ITEMS.map(({ to, end, labelKey, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `${LINK} ${isActive ? 'bg-primary-soft !text-primary' : ''}`
                }
              >
                <Icon aria-hidden="true" className="size-4" />
                {t(labelKey)}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className={`${LINK} border border-border`}
            onClick={() => logout.mutate()}
          >
            <LogOut aria-hidden="true" className="size-4" />
            <span className="sr-only sm:not-sr-only">
              {customer ? `${customer.name} · ` : ''}
              {t('auth:signOut')}
            </span>
          </button>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl p-4 md:py-8">
        <ErrorBoundary FallbackComponent={RootFallback} onError={(e) => reportError(e)}>
          <Suspense fallback={<Skeleton rows={6} />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
