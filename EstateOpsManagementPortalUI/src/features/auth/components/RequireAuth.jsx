import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { TenantProvider } from '@/shared/lib/tenant.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { LOGIN_PATH } from '../domain/auth.constants.js';
import { useBindAuthLink } from '../hooks/useBindAuthLink.js';
import { useSessionQuery } from '../hooks/useSessionQuery.js';

/**
 * Route guard. Restores the session (refreshing the token if needed), sends signed-out users to
 * login (remembering where they were going), and provides the tenant's currency, locale,
 * time zone and area unit to everything beneath it.
 */
export default function RequireAuth() {
  useBindAuthLink();
  const location = useLocation();
  const session = useSessionQuery();

  if (session.isPending) {
    return (
      <div className="p-8">
        <Skeleton rows={4} />
      </div>
    );
  }
  if (session.isError || !session.data) {
    return (
      <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname + location.search }} />
    );
  }
  return (
    <TenantProvider tenant={session.data.tenant}>
      <Outlet />
    </TenantProvider>
  );
}
