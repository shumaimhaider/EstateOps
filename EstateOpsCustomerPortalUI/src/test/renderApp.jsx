import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { createTestRouter } from '@/app/router/index.jsx';
import { TenantProvider } from '@/shared/lib/tenant.jsx';
import ToastProvider from '@/shared/ui/toast/ToastProvider.jsx';
import { createTestQueryClient } from './renderWithProviders.jsx';

/** Renders the whole app (real router, guards, lazy pages) at `route`. */
export function renderApp(route = '/') {
  const router = createTestRouter([route]);
  const client = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <TenantProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </TenantProvider>
    </QueryClientProvider>,
  );
  return { router, client, ...view };
}
