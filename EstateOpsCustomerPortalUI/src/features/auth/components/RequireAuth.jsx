import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { TenantProvider } from '@/shared/lib/tenant.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { LOGIN_PATH } from '../domain/auth.constants.js';
import { useBindAuthLink, useSessionQuery } from '../hooks/auth.hooks.js';

/** Route guard: restores the session, sends signed-out customers to sign in, and gives everything below the developer's formats. */
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
