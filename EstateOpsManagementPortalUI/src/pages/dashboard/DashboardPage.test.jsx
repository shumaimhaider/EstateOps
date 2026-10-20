import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { getDb } from '@/test/mockServer.js';
import { renderApp } from '@/test/renderApp.jsx';

const waitForDashboard = () => screen.findByRole('heading', { level: 1, name: /Welcome back/ });

describe('dashboard', () => {
  it('shows unit, money and chart stats with no axe violations', async () => {
    const { container } = renderApp('/');
    await waitForDashboard();
    expect(await screen.findByText('Total sale value')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Collected vs due by month' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('links sold and unsold plots (and every tile) to the filtered Units list', async () => {
    const { router } = renderApp('/');
    await waitForDashboard();
    const byType = await screen.findByRole('region', { name: 'Inventory by type' });
    const hrefs = within(byType)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/inventory/units?kind=plot&status=sold');
    expect(hrefs).toContain('/inventory/units?kind=plot&status=available');
    expect(hrefs).toContain('/inventory/units?kind=flat&status=sold');

    expect(await screen.findByRole('link', { name: /Unsold units/ })).toHaveAttribute(
      'href',
      '/inventory/units?status=available',
    );
    await userEvent.click(
      within(byType)
        .getAllByRole('link')
        .find((a) => a.getAttribute('href') === '/inventory/units?kind=plot&status=sold'),
    );
    const table = await screen.findByRole('table', { name: 'Units' });
    expect(router.state.location.search).toBe('?kind=plot&status=sold');
    expect(within(table).getAllByText('Sold').length).toBeGreaterThan(0);
    expect(within(table).queryByText('Available')).not.toBeInTheDocument();
  });

  it('scopes every stat to one project, or all projects', async () => {
    const { router } = renderApp('/');
    await waitForDashboard();
    const db = getDb();
    const tenant = db.tenants[0];
    const all = db.units.filter((u) => u.tenant_id === tenant.id).length;
    expect(
      await screen.findByRole('link', { name: new RegExp(`Total units ${all}\\b`) }),
    ).toBeInTheDocument();

    const project = db.projects.find(
      (p) => p.tenant_id === tenant.id && p.name === 'Skyline Tower',
    );
    const inProject = db.units.filter((u) => u.project_id === project.id).length;
    await userEvent.selectOptions(screen.getByLabelText('Project scope'), 'Skyline Tower');
    expect(
      await screen.findByRole('link', { name: new RegExp(`Total units ${inProject}\\b`) }),
    ).toHaveAttribute('href', `/inventory/units?project=${project.id}`);
    expect(router.state.location.search).toBe(`?project=${project.id}`);

    await userEvent.selectOptions(screen.getByLabelText('Project scope'), '');
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('shows the escalated count in the sidebar and a spotlight of the worst cases', async () => {
    renderApp('/');
    await waitForDashboard();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(
      await within(nav).findByRole('link', { name: /Escalated cases, \d+/ }),
    ).toBeInTheDocument();
    const spotlight = await screen.findByRole('region', { name: 'Escalated cases' });
    expect(within(spotlight).getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/stats/escalations',
    );
  });
});
