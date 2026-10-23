import {
  Building2,
  CalendarCheck,
  ChartColumn,
  CreditCard,
  LifeBuoy,
  HandCoins,
  LayoutDashboard,
  Percent,
  Rows3,
  ShieldCheck,
  TriangleAlert,
  Users,
} from 'lucide-react';

/** Sidebar navigation. `perm` is the permission that shows the item. `badge: 'escalated'` shows the live escalated-case count. `prefetch` warms the lazy chunk. */
export const NAV_GROUPS = [
  {
    labelKey: 'nav.groupOverview',
    items: [
      {
        to: '/',
        perm: 'dashboard.view',
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
        perm: 'stats.view',
        end: true,
        labelKey: 'nav.stats',
        icon: ChartColumn,
        prefetch: () => import('@/pages/stats/StatsOverviewPage.jsx'),
      },
      {
        to: '/stats/escalations',
        perm: 'escalations.view',
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
        perm: 'projects.view',
        labelKey: 'nav.projects',
        icon: Building2,
        prefetch: () => import('@/pages/inventory/ProjectsPage.jsx'),
      },
      {
        to: '/inventory/units',
        perm: 'units.view',
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
        perm: 'sales.view',
        labelKey: 'nav.sales',
        icon: HandCoins,
        prefetch: () => import('@/pages/sales/SalesPage.jsx'),
      },
      {
        to: '/payments/transactions',
        perm: 'sales.view',
        labelKey: 'nav.transactions',
        icon: CreditCard,
        prefetch: () => import('@/pages/payments/TransactionsPage.jsx'),
      },
      {
        to: '/payments/collections',
        perm: 'stats.view',
        labelKey: 'nav.collectionRuns',
        icon: CalendarCheck,
        prefetch: () => import('@/pages/collections/CollectionRunsPage.jsx'),
      },
      {
        to: '/support',
        perm: 'customers.view',
        labelKey: 'nav.support',
        icon: LifeBuoy,
        badge: 'support',
        prefetch: () => import('@/pages/support/SupportPage.jsx'),
      },
      {
        to: '/customers',
        perm: 'customers.view',
        labelKey: 'nav.customers',
        icon: Users,
        prefetch: () => import('@/pages/customers/CustomersPage.jsx'),
      },
    ],
  },
  {
    labelKey: 'nav.groupSettings',
    items: [
      {
        to: '/settings/fines',
        perm: 'fines.view',
        labelKey: 'nav.fines',
        icon: Percent,
        prefetch: () => import('@/pages/settings/FineRatesPage.jsx'),
      },
      {
        to: '/settings/permissions',
        perm: 'permissions.manage',
        labelKey: 'nav.permissions',
        icon: ShieldCheck,
        prefetch: () => import('@/pages/settings/PermissionsPage.jsx'),
      },
    ],
  },
];
