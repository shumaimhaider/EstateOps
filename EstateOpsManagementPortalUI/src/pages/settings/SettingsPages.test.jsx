import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { getDb, mockToken, tokenStore } from '@/test/mockServer.js';
import { renderApp } from '@/test/renderApp.jsx';

const asRole = (role) => tokenStore.set(mockToken('pk', role));
const pkId = () => getDb().tenants[0].id;

describe('roles and permissions page', () => {
  it('lets the admin switch a permission on for a role, and locks owner and admin', async () => {
    asRole('admin');
    const { container } = renderApp('/settings/permissions');
    const table = await screen.findByRole('table', { name: 'Role permissions' });
    expect(await axe(container)).toHaveNoViolations();

    const box = within(table).getByRole('checkbox', { name: 'Support: See collection stats' });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(await screen.findByText('Permissions saved for Support')).toBeInTheDocument();
    expect(getDb().permissions[pkId()].support).toContain('stats.view');
    await waitFor(() => expect(box).toBeChecked());

    const locked = within(table).getByRole('checkbox', { name: 'Admin: See collection stats' });
    expect(locked).toBeChecked();
    expect(locked).toBeDisabled();
  });

  it('shows the module only to roles that may manage permissions', async () => {
    asRole('sales_agent');
    renderApp('/settings/permissions');
    expect(await screen.findByText('You do not have access to this page')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).queryByRole('link', { name: 'Roles and permissions' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Fine rates' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Customers' })).toBeInTheDocument();
  });

  it('hides sidebar modules a role was not given, and honours a change by the admin', async () => {
    asRole('support');
    getDb().permissions[pkId()].support = ['dashboard.view', 'customers.view'];
    renderApp('/customers');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Customers' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Sales' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Units' })).toBeNull();
  });
});

describe('fine rates page', () => {
  it('changes the default rate and recalculates overdue fines', async () => {
    renderApp('/settings/fines');
    const card = await screen.findByRole('region', { name: 'Default fine rate' });
    expect(within(card).getByText('2% of each overdue installment')).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Change rate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change the default fine rate' });
    const percent = within(dialog).getByLabelText('Percentage (%)');
    await userEvent.clear(percent);
    await userEvent.type(percent, '3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rate' }));

    expect(await screen.findByText(/Fine rate saved/)).toBeInTheDocument();
    const db = getDb();
    const overdue = db.installments.find((i) => i.tenant_id === pkId() && i.status === 'overdue');
    expect(overdue.fine_amount).toBe(Math.round(overdue.amount * 0.03));
  });

  it('validates the rate before saving', async () => {
    renderApp('/settings/fines');
    const card = await screen.findByRole('region', { name: 'Default fine rate' });
    await userEvent.click(within(card).getByRole('button', { name: 'Change rate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change the default fine rate' });
    const percent = within(dialog).getByLabelText('Percentage (%)');
    await userEvent.clear(percent);
    await userEvent.type(percent, '150');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rate' }));
    expect(await within(dialog).findByText('Enter a percentage from 0 to 100')).toBeInTheDocument();
  });

  it('sets a rate for one category, which then shows in the list of specific rates', async () => {
    renderApp('/settings/fines');
    await screen.findByRole('region', { name: 'Default fine rate' });
    await userEvent.click(screen.getByText('Rates by category'));
    const shops = await screen.findByRole('region', { name: 'Shops' });
    expect(within(shops).getByText(/Inherited from the Default rate/)).toBeInTheDocument();

    await userEvent.click(within(shops).getByRole('button', { name: 'Set a specific rate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set the Default rate for Shops' });
    const percent = within(dialog).getByLabelText('Percentage (%)');
    await userEvent.clear(percent);
    await userEvent.type(percent, '5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rate' }));

    const table = await screen.findByRole('table', { name: 'Specific fine rates' });
    const row = within(table).getByRole('row', { name: /Shops/ });
    expect(within(row).getByText('5% of each overdue installment')).toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: /Remove the rate for/ }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Remove specific rate' })).getByRole(
        'button',
        { name: 'Remove specific rate' },
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('table', { name: 'Specific fine rates' })).toBeNull(),
    );
  });
});

describe('fine rates on project and customer pages', () => {
  it('sets a project rate for one category', async () => {
    const project = getDb().projects.find((p) => p.tenant_id === pkId());
    renderApp(`/inventory/projects/${project.id}`);
    const card = await screen.findByRole('region', { name: 'Fine rate for this project' });
    expect(within(card).getByText(/Inherited from the Default rate/)).toBeInTheDocument();

    await userEvent.click(screen.getByText('Rates by category'));
    const plots = await screen.findByRole('region', { name: 'Plots' });
    await userEvent.click(within(plots).getByRole('button', { name: 'Set a specific rate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set the Project rate for Plots' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Charge as'), 'fixed');
    await userEvent.type(within(dialog).getByLabelText(/^Amount/), '2500');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rate' }));

    await waitFor(() =>
      expect(
        getDb().fineRules.find(
          (r) => r.scope === 'project' && r.scope_id === project.id && r.unit_kind === 'plot',
        ),
      ).toMatchObject({ kind: 'fixed', value: 250_000 }),
    );
  });

  it('sets a rate for a customer, and hides it from roles that cannot see fines', async () => {
    const db = getDb();
    const row = db.installments.find((i) => i.tenant_id === pkId() && i.status === 'overdue');
    const customer = db.customers.find(
      (c) => c.id === db.bookings.find((b) => b.id === row.booking_id).customer_id,
    );

    asRole('finance');
    const view = renderApp(`/customers/${customer.id}`);
    const card = await screen.findByRole('region', { name: 'Fine rate for this customer' });
    await userEvent.click(within(card).getByRole('button', { name: 'Set a specific rate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set a fine rate for this customer' });
    const percent = within(dialog).getByLabelText('Percentage (%)');
    await userEvent.clear(percent);
    await userEvent.type(percent, '10');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rate' }));
    await waitFor(() =>
      expect(
        db.fineRules.find((r) => r.scope === 'customer' && r.scope_id === customer.id),
      ).toMatchObject({ kind: 'percent', value: 1000 }),
    );
    expect(await within(card).findByText('10% of each overdue installment')).toBeInTheDocument();
    view.unmount();

    asRole('sales_agent');
    renderApp(`/customers/${customer.id}`);
    await screen.findByRole('heading', { level: 1, name: customer.full_name });
    expect(screen.queryByRole('region', { name: 'Fine rate for this customer' })).toBeNull();
  });

  it('shows a read-only rate to a role that cannot manage fines', async () => {
    asRole('auditor');
    const unit = getDb().units.find((u) => u.tenant_id === pkId() && u.booking_id);
    renderApp(`/inventory/units/${unit.id}`);
    const card = await screen.findByRole('region', { name: 'Fine rate for this property' });
    expect(within(card).getByText('2% of each overdue installment')).toBeInTheDocument();
    expect(within(card).queryByRole('button')).toBeNull();
  });
});
