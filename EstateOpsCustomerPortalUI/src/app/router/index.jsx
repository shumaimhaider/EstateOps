import { lazy, Suspense } from 'react';
import { createBrowserRouter, createMemoryRouter } from 'react-router-dom';
import { RequireAuth } from '@/features/auth/index.js';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import AppShell from '../layout/AppShell.jsx';
import RouteError from '../errors/RouteError.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage.jsx'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage.jsx'));
const SetPasswordPage = lazy(() => import('@/pages/auth/SetPasswordPage.jsx'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage.jsx'));
const PropertyPage = lazy(() => import('@/pages/properties/PropertyPage.jsx'));
const AccountPage = lazy(() => import('@/pages/account/AccountPage.jsx'));
const SupportPage = lazy(() => import('@/pages/support/SupportPage.jsx'));

const open = (element) => ({
  element: <Suspense fallback={<Skeleton rows={4} />}>{element}</Suspense>,
  errorElement: <RouteError />,
});

export const routes = [
  { path: '/login', ...open(<LoginPage />) },
  { path: '/forgot-password', ...open(<ForgotPasswordPage />) },
  { path: '/set-password', ...open(<SetPasswordPage mode="invite" />) },
  { path: '/reset-password', ...open(<SetPasswordPage mode="reset" />) },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'properties/:propertyId', element: <PropertyPage /> },
          { path: 'support', element: <SupportPage /> },
          { path: 'support/:requestId', element: <SupportPage /> },
          { path: 'account', element: <AccountPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
export const createTestRouter = (initialEntries) => createMemoryRouter(routes, { initialEntries });
