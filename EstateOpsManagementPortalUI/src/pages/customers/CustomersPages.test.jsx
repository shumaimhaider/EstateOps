import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { getDb } from '@/test/mockServer.js';
import { renderApp } from '@/test/renderApp.jsx';

/** A PK customer with at least one overdue installment. */
function customerWithOverdue() {
  const db = getDb();
  const pk = db.tenants[0].id;
  const row = db.installments.find((i) => i.tenant_id === pk && i.status === 'overdue');
  return db.customers.find(
    (c) => c.id === db.bookings.find((b) => b.id === row.booking_id).customer_id,
  );
}

describe('Customers tab', () => {
  it('lists customers with masked ID numbers and opens a profile', async () => {
    const { container, router } = renderApp('/customers');
    const table = await screen.findByRole('table', { name: 'Customers' });
    expect(within(table).getAllByRole('row').length).toBe(26);
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(within(table).getAllByRole('link', { name: /\w/ })[0]);
    await screen.findByText('ID number');
    expect(router.state.location.pathname).toMatch(/^\/customers\/[0-9a-f-]{36}$/);
    expect(screen.getByText(/^\*+/)).toBeInTheDocument();
  });

  it('has Customers in the sidebar', async () => {
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Customers' })).toHaveAttribute(
      'href',
      '/customers',
    );
  });
});

describe('taking payments on a customer behalf', () => {
  it('takes a full payment against the oldest unpaid invoice on the customer behalf', async () => {
    const customer = customerWithOverdue();
    renderApp(`/customers/${customer.id}`);
    await screen.findByRole('heading', { level: 1, name: customer.full_name });
    const paidBefore = getDb().installments.filter((i) => i.status === 'paid').length;

    await userEvent.click(await screen.findByRole('button', { name: 'Take payment' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record payment' });
    expect(within(dialog).getByText(/Taking payment from/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));

    expect(await screen.findByText(/Payment recorded for INV-PK-/)).toBeInTheDocument();
    await waitFor(() =>
      expect(getDb().installments.filter((i) => i.status === 'paid').length).toBe(paidBefore + 1),
    );
  });

  it('validates the amount on the client and supports a part payment', async () => {
    const customer = customerWithOverdue();
    renderApp(`/customers/${customer.id}`);
    await screen.findByRole('heading', { level: 1, name: customer.full_name });
    await userEvent.click(await screen.findByRole('button', { name: 'Take payment' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record payment' });
    const amount = within(dialog).getByLabelText(/Amount/);
    const full = amount.value;

    await userEvent.clear(amount);
    await userEvent.type(amount, '999999999999');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    expect(
      await within(dialog).findByText('Enter an amount up to the outstanding balance'),
    ).toBeInTheDocument();

    await userEvent.clear(amount);
    await userEvent.type(amount, String(Math.floor(Number(full) / 4)));
    await userEvent.type(within(dialog).getByLabelText(/Payment reference/), 'CHQ-77');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    expect(await screen.findByText(/Payment recorded for INV-PK-/)).toBeInTheDocument();

    const part = getDb().installments.find((i) => i.payment_reference === 'CHQ-77');
    expect(part.paid_amount).toBeGreaterThan(0);
    expect(part.paid_amount).toBeLessThan(part.amount);
    expect(part.status).not.toBe('paid');
  });

  it('records a payment from a row of the property invoices', async () => {
    const customer = customerWithOverdue();
    const booking = getDb().bookings.find(
      (b) =>
        b.customer_id === customer.id &&
        getDb().installments.some((i) => i.booking_id === b.id && i.status === 'overdue'),
    );
    renderApp(`/sales/${booking.id}`);
    const table = await screen.findByRole('table', { name: 'Scheduled invoices' });
    expect(within(table).getAllByText('Overdue').length).toBeGreaterThan(0);
    const [action] = await within(table).findAllByRole('button', {
      name: /Record payment INV-PK-/,
    });
    await userEvent.click(action);
    const dialog = await screen.findByRole('dialog', { name: 'Record payment' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Method'), 'Bank transfer');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    expect(await screen.findByText(/Payment recorded for INV-PK-/)).toBeInTheDocument();
  });
});

describe('invoices belong to the customer', () => {
  it('has no Invoices tab, and the old /invoices link lands on Customers', async () => {
    const { router } = renderApp('/invoices');
    await screen.findByRole('table', { name: 'Customers' });
    expect(router.state.location.pathname).toBe('/customers');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).queryByRole('link', { name: 'Invoices' })).not.toBeInTheDocument();
  });

  it('customer shows how many properties they own; opening one shows its invoices', async () => {
    const db = getDb();
    const owned = (c) => db.bookings.filter((b) => b.customer_id === c.id);
    const customer = db.customers.find(
      (c) => c.tenant_id === db.tenants[0].id && owned(c).length >= 2,
    );
    const { router } = renderApp(`/customers/${customer.id}`);

    expect(
      await screen.findByRole('heading', { name: `Owns ${owned(customer).length} properties` }),
    ).toBeInTheDocument();
    const properties = await screen.findByRole('table', { name: 'Bookings' });
    expect(within(properties).getAllByRole('row')).toHaveLength(owned(customer).length + 1);
    expect(screen.queryByRole('table', { name: 'Scheduled invoices' })).not.toBeInTheDocument();

    const first = owned(customer)[0];
    const unitNo = db.units.find((u) => u.id === first.unit_id).unit_no;
    await userEvent.click(
      within(properties).getByRole('link', { name: `View invoices for ${unitNo}` }),
    );

    const invoices = await screen.findByRole('table', { name: 'Scheduled invoices' });
    expect(router.state.location.pathname).toBe(`/sales/${first.id}`);
    const rows = db.installments.filter((i) => i.booking_id === first.id).length;
    expect(within(invoices).getAllByRole('row')).toHaveLength(rows + 1);
    // back goes to the owner
    expect(screen.getByRole('link', { name: `Back to ${customer.full_name}` })).toHaveAttribute(
      'href',
      `/customers/${customer.id}`,
    );
  });
});
