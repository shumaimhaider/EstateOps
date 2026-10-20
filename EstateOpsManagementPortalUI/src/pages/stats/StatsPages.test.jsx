import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { getDb } from '@/test/mockServer.js';
import { renderApp } from '@/test/renderApp.jsx';

describe('stats section', () => {
  it('shows installments scheduled, charts and the project breakdown', async () => {
    const { container } = renderApp('/stats');
    expect(await screen.findByRole('heading', { level: 1, name: 'Stats' })).toBeInTheDocument();
    const counts = await screen.findByRole('region', { name: 'Installments scheduled' });
    const db = getDb();
    const pk = db.tenants[0].id;
    const active = db.installments.filter(
      (i) => i.tenant_id === pk && !['waived', 'cancelled', 'rescheduled'].includes(i.status),
    );
    expect(within(counts).getByText('Scheduled in total').parentElement).toHaveTextContent(
      active.length.toLocaleString(),
    );
    expect(screen.getByRole('region', { name: 'Overdue ageing' })).toBeInTheDocument();
    const breakdown = screen.getByRole('table', { name: 'Collections by project' });
    expect(within(breakdown).getAllByRole('row')).toHaveLength(4); // header + 3 projects
    expect(await axe(container)).toHaveNoViolations();
  });

  it('lists escalated cases on their own tab and sends a notice after confirmation', async () => {
    renderApp('/stats');
    const tabs = await screen.findByRole('navigation', { name: 'Stats sections' });
    await userEvent.click(await within(tabs).findByRole('link', { name: /Escalated cases/ }));
    const table = await screen.findByRole('table', { name: 'Escalated cases' });
    const [button] = await within(table).findAllByRole('button', { name: /Send notice/ });
    await userEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Send notice letter' });
    expect(within(dialog).getByText(/missed installments/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send notice' }));
    expect(await screen.findByText(/Notice letter sent to/)).toBeInTheDocument();
    await waitFor(() => expect(getDb().notices.length).toBeGreaterThan(0));
  });
});
