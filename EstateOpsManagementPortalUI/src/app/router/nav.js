import {
  Building2,
  ChartColumn,
  HandCoins,
  LayoutDashboard,
  Rows3,
  TriangleAlert,
  Users,
} from 'lucide-react';

/** Sidebar navigation. `badge: 'escalated'` shows the live escalated-case count. `prefetch` warms the lazy chunk. */
export const NAV_GROUPS = [
  {
    labelKey: 'nav.groupOverview',
    items: [
      {
        to: '/',
        end: true,
        labelKey: 'nav.dashboard',
        icon: LayoutDashboard,
        prefetch: () => import('@/pages/dashboard/DashboardPage.jsx'),
      },
    ],
  },
  {
    labelKey: 'nav.groupInsights',
    items: [
      {
        to: '/stats',
        end: true,
        labelKey: 'nav.stats',
        icon: ChartColumn,
        prefetch: () => import('@/pages/stats/StatsOverviewPage.jsx'),
      },
      {
        to: '/stats/escalations',
        labelKey: 'nav.escalations',
        icon: TriangleAlert,
        badge: 'escalated',
        prefetch: () => import('@/pages/stats/EscalationsPage.jsx'),
      },
    ],
  },
  {
    labelKey: 'nav.groupInventory',
    items: [
      {
        to: '/inventory/projects',
        labelKey: 'nav.projects',
        icon: Building2,
        prefetch: () => import('@/pages/inventory/ProjectsPage.jsx'),
      },
      {
        to: '/inventory/units',
        labelKey: 'nav.units',
        icon: Rows3,
        prefetch: () => import('@/pages/inventory/UnitsPage.jsx'),
      },
    ],
  },
  {
    labelKey: 'nav.groupSales',
    items: [
      {
        to: '/sales',
        labelKey: 'nav.sales',
        icon: HandCoins,
        prefetch: () => import('@/pages/sales/SalesPage.jsx'),
      },
      {
        to: '/customers',
        labelKey: 'nav.customers',
        icon: Users,
        prefetch: () => import('@/pages/customers/CustomersPage.jsx'),
      },
    ],
  },
];
