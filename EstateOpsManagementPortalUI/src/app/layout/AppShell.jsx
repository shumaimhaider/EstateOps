import { Suspense, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from 'react-error-boundary';
import { Building2, Menu, X } from 'lucide-react';
import { UserMenu, useCurrentUser } from '@/features/auth/index.js';
import { useCollectionsStatsQuery } from '@/features/collections/index.js';
import { reportError } from '@/shared/lib/errorReporter.js';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import RootFallback from '../errors/RootFallback.jsx';
import { NAV_GROUPS } from '../router/nav.js';

const LINK =
  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-content transition hover:bg-sidebar-active/60 hover:text-white';

/** Layout shell: dark sidebar with grouped nav, top bar with tenant and user, lazy page outlet. */
export default function AppShell() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const stats = useCollectionsStatsQuery({});
  const [open, setOpen] = useState(false);
  const badges = { escalated: stats.data?.escalatedCount };

  return (
    <div className="min-h-screen md:grid md:grid-cols-[17rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-2"
      >
        {t('app.skipToContent')}
      </a>

      <aside
        id="sidebar"
        className={`${open ? 'flex' : 'hidden'} flex-col gap-6 bg-sidebar p-4 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto`}
      >
        <p className="flex items-center gap-3 px-2 pt-1 text-lg font-bold text-white">
          <span className="grid size-9 place-items-center rounded-xl bg-primary">
            <Building2 aria-hidden="true" className="size-5" />
          </span>
          {t('app.name')}
        </p>
        <nav aria-label={t('nav.main')} className="flex flex-col gap-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.labelKey}>
              <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-widest text-sidebar-content/60">
                {t(group.labelKey)}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(({ to, end, labelKey, icon: Icon, badge, prefetch }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      onMouseEnter={prefetch}
                      onFocus={prefetch}
                      aria-label={
                        badge && badges[badge] > 0 ? `${t(labelKey)}, ${badges[badge]}` : undefined
                      }
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `${LINK} ${isActive ? 'bg-sidebar-active !text-white' : ''}`
                      }
                    >
                      <Icon aria-hidden="true" className="size-[18px]" />
                      <span className="flex-1">{t(labelKey)}</span>
                      {badge && badges[badge] > 0 && (
                        <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">
                          {badges[badge]}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-border p-2 md:hidden"
              aria-expanded={open}
              aria-controls="sidebar"
              aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? (
                <X aria-hidden="true" className="size-5" />
              ) : (
                <Menu aria-hidden="true" className="size-5" />
              )}
            </button>
            <p className="hidden text-sm font-semibold text-content-muted sm:block">
              {user?.tenant.name}
            </p>
          </div>
          <UserMenu />
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] p-4 md:p-8">
          <ErrorBoundary FallbackComponent={RootFallback} onError={(e) => reportError(e)}>
            <Suspense fallback={<Skeleton rows={6} />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
