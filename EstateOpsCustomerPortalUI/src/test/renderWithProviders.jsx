import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TenantProvider } from '@/shared/lib/tenant.jsx';
import ToastProvider from '@/shared/ui/toast/ToastProvider.jsx';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Renders UI with query, router, tenant and toast providers (no network unless the UI makes it). */
export function renderWithProviders(ui, { route = '/', client = createTestQueryClient() } = {}) {
  return render(
    <QueryClientProvider client={client}>
      <TenantProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </ToastProvider>
      </TenantProvider>
    </QueryClientProvider>,
  );
}
