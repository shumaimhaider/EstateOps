import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { TRANSPORT_OVERRIDES } from '@/shared/config/transport.config.js';
import { TenantProvider } from '@/shared/lib/tenant.jsx';
import ToastProvider from '@/shared/ui/toast/ToastProvider.jsx';
import { createTestQueryClient } from '@/test/renderWithProviders.jsx';
import { getDb } from '@/test/mockServer.js';
import UnitDetailPage from './UnitDetailPage.jsx';
import UnitsPage from './UnitsPage.jsx';

function renderDetail(id) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TenantProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/inventory/units/${id}`]}>
            <Routes>
              <Route path="/inventory/units/:unitId" element={<UnitDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </TenantProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  delete TRANSPORT_OVERRIDES.inventory;
});

describe('UnitDetailPage', () => {
  it('shows details, status history, and no actions for a sold unit', async () => {
    const sold = getDb().units.find(
      (u) => u.status === 'sold' && u.tenant_id === getDb().tenants[0].id,
    );
    const { container } = renderDetail(sold.id);
    expect(
      await screen.findByRole('heading', { level: 1, name: `Unit ${sold.unit_no}` }),
    ).toBeInTheDocument();
    const history = screen.getByRole('region', { name: 'Status history' });
    expect(within(history).getAllByRole('listitem').length).toBe(sold.status_history.length);
    expect(screen.queryByRole('button', { name: /^(Block|Unblock)$/ })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('offers Unblock (not Block) for a blocked unit', async () => {
    const blocked = getDb().units.find(
      (u) => u.status === 'blocked' && u.tenant_id === getDb().tenants[0].id,
    );
    renderDetail(blocked.id);
    expect(await screen.findByRole('button', { name: 'Unblock' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Block' })).not.toBeInTheDocument();
  });

  it('shows a not-found state for an unknown or cross-tenant unit', async () => {
    renderDetail('00000000-0000-4000-8000-000000000000');
    expect(await screen.findByText('Unit not found')).toBeInTheDocument();
    const otherTenantUnit = getDb().units.find((u) => u.tenant_id === getDb().tenants[1].id);
    renderDetail(otherTenantUnit.id);
    expect(await screen.findAllByText('Unit not found')).not.toHaveLength(0);
  });
});

describe('transport switch', () => {
  it('renders the units list over GraphQL with no component changes', async () => {
    TRANSPORT_OVERRIDES.inventory = 'graphql';
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <TenantProvider>
          <ToastProvider>
            <MemoryRouter>
              <UnitsPage />
            </MemoryRouter>
          </ToastProvider>
        </TenantProvider>
      </QueryClientProvider>,
    );
    const table = await screen.findByRole('table', { name: 'Units' });
    expect(within(table).getAllByRole('row')).toHaveLength(26);
  });
});
