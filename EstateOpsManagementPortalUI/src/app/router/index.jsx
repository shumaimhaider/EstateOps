import { lazy, Suspense } from 'react';
import { createBrowserRouter, createMemoryRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from '@/features/auth/index.js';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import AppShell from '../layout/AppShell.jsx';
import RouteError from '../errors/RouteError.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';

// Every feature page is lazy-loaded: one chunk per route.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage.jsx'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage.jsx'));
const StatsLayout = lazy(() => import('@/pages/stats/StatsLayout.jsx'));
const StatsOverviewPage = lazy(() => import('@/pages/stats/StatsOverviewPage.jsx'));
const EscalationsPage = lazy(() => import('@/pages/stats/EscalationsPage.jsx'));
const ProjectsPage = lazy(() => import('@/pages/inventory/ProjectsPage.jsx'));
const ProjectDetailPage = lazy(() => import('@/pages/inventory/ProjectDetailPage.jsx'));
const UnitsPage = lazy(() => import('@/pages/inventory/UnitsPage.jsx'));
const UnitDetailPage = lazy(() => import('@/pages/inventory/UnitDetailPage.jsx'));
const SalesPage = lazy(() => import('@/pages/sales/SalesPage.jsx'));
const BookingDetailPage = lazy(() => import('@/pages/sales/BookingDetailPage.jsx'));
const CustomersPage = lazy(() => import('@/pages/customers/CustomersPage.jsx'));
const CustomerDetailPage = lazy(() => import('@/pages/customers/CustomerDetailPage.jsx'));

const page = (element) => ({ element, errorElement: <RouteError /> });

export const routes = [
  {
    path: '/login',
    element: (
      <Suspense fallback={<Skeleton rows={4} />}>
        <LoginPage />
      </Suspense>
    ),
    errorElement: <RouteError />,
  },
  {
    // Everything below requires a signed-in user.
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteError />,
        children: [
          { index: true, ...page(<DashboardPage />) },
          {
            path: 'stats',
            element: <StatsLayout />,
            errorElement: <RouteError />,
            children: [
              { index: true, ...page(<StatsOverviewPage />) },
              { path: 'escalations', ...page(<EscalationsPage />) },
            ],
          },
          { path: 'inventory/projects', ...page(<ProjectsPage />) },
          { path: 'inventory/projects/:projectId', ...page(<ProjectDetailPage />) },
          { path: 'inventory/units', ...page(<UnitsPage />) },
          { path: 'inventory/units/:unitId', ...page(<UnitDetailPage />) },
          { path: 'sales', ...page(<SalesPage />) },
          { path: 'sales/:bookingId', ...page(<BookingDetailPage />) },
          { path: 'customers', ...page(<CustomersPage />) },
          { path: 'customers/:customerId', ...page(<CustomerDetailPage />) },
          // Invoices live under each customer's properties; old links land on Customers.
          { path: 'invoices', element: <Navigate to="/customers" replace /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
export const createTestRouter = (initialEntries) => createMemoryRouter(routes, { initialEntries });
