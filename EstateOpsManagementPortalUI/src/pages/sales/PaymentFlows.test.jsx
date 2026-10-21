import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getDb, mockToken, tokenStore } from '@/test/mockServer.js';
import { renderApp } from '@/test/renderApp.jsx';

/** An unpaid overdue PK invoice and the page of its booking. */
function overdueInvoice() {
  const db = getDb();
  return db.installments.find(
    (i) => i.tenant_id === db.tenants[0].id && i.status === 'overdue' && i.paid_amount === 0,
  );
}

async function openPayDialog(row) {
  renderApp(`/sales/${row.booking_id}`);
  const table = await screen.findByRole('table', { name: 'Scheduled invoices' });
  await userEvent.click(
    await within(table).findByRole('button', { name: `Record payment ${row.invoice_no}` }),
  );
  return screen.findByRole('dialog', { name: 'Record payment' });
}

const major = (minor) => (minor / 100).toFixed(2);

async function fillCard(dialog, number = '4242 4242 4242 4242') {
  await userEvent.type(within(dialog).getByLabelText('Card number'), number);
  await userEvent.type(within(dialog).getByLabelText('Expiry (MM/YY)'), '12/30');
  await userEvent.type(within(dialog).getByLabelText('Security code (CVC)'), '123');
}

describe('taking a payment from an invoice', () => {
  it('marks a payment received on an earlier date with a reference', async () => {
    const row = overdueInvoice();
    const dialog = await openPayDialog(row);
    await userEvent.selectOptions(within(dialog).getByLabelText('Method'), 'Bank transfer');
    fireEvent.change(within(dialog).getByLabelText('Date received'), {
      target: { value: '2026-10-01' },
    });
    await userEvent.type(within(dialog).getByLabelText(/Payment reference/), 'TT-5521');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));

    expect(await screen.findByText(`Payment recorded for ${row.invoice_no}`)).toBeInTheDocument();
    expect(getDb().payments.at(-1)).toMatchObject({
      source: 'manual',
      received_on: '2026-10-01',
      reference: 'TT-5521',
    });
  });

  it('shows the server message when the received date is in the future', async () => {
    const dialog = await openPayDialog(overdueInvoice());
    fireEvent.change(within(dialog).getByLabelText('Date received'), {
      target: { value: '2999-01-01' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    expect(
      await within(dialog).findByText('The received date cannot be in the future'),
    ).toBeInTheDocument();
  });

  it('adjusts the invoice amount while paying, and the amount to pay follows the new balance', async () => {
    const row = overdueInvoice();
    const original = row.amount;
    const adjusted = original - 150_000;
    const dialog = await openPayDialog(row);

    await userEvent.click(within(dialog).getByLabelText('Adjust the invoice amount'));
    const newAmount = within(dialog).getByLabelText(/New invoice amount/);
    await userEvent.clear(newAmount);
    await userEvent.type(newAmount, major(adjusted));
    expect(within(dialog).getByLabelText(/^Amount/)).toHaveValue(major(adjusted));

    // a reason is required
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    expect(
      await within(dialog).findByText('Give a reason for changing the invoice amount'),
    ).toBeInTheDocument();

    await userEvent.type(
      within(dialog).getByLabelText('Reason for the change'),
      'Early settlement',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    expect(await screen.findByText(`Payment recorded for ${row.invoice_no}`)).toBeInTheDocument();
    expect(row).toMatchObject({
      amount: adjusted,
      original_amount: original,
      adjustment_reason: 'Early settlement',
      status: 'paid',
    });
    // the table shows what the invoice was before
    expect(await screen.findAllByText(/was/)).not.toHaveLength(0);
  });

  it('pays by card: charges the card, then records the Stripe payment', async () => {
    const row = overdueInvoice();
    const dialog = await openPayDialog(row);
    await userEvent.click(within(dialog).getByLabelText('Pay by card (Stripe)'));
    expect(within(dialog).queryByLabelText('Method')).toBeNull();
    await fillCard(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay by card' }));

    expect(
      await screen.findByText(`Card payment received for ${row.invoice_no}`),
    ).toBeInTheDocument();
    expect(getDb().payments.at(-1)).toMatchObject({ source: 'stripe', method: 'card' });
    expect(row.status).toBe('paid');
  });

  it('keeps the dialog open and the invoice unpaid when the card is declined', async () => {
    const row = overdueInvoice();
    const dialog = await openPayDialog(row);
    await userEvent.click(within(dialog).getByLabelText('Pay by card (Stripe)'));
    await fillCard(dialog, '4000 0000 0000 0002');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay by card' }));

    expect(
      await within(dialog).findByText('Could not record the payment: Your card was declined.'),
    ).toBeInTheDocument();
    expect(row.paid_amount).toBe(0);
    expect(dialog).toBeInTheDocument();
  });

  it('checks the card fields on the client', async () => {
    const dialog = await openPayDialog(overdueInvoice());
    await userEvent.click(within(dialog).getByLabelText('Pay by card (Stripe)'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay by card' }));
    expect(await within(dialog).findByText('Enter the card number')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter the expiry as MM/YY')).toBeInTheDocument();
    expect(getDb().payments).toHaveLength(0);
  });

  it('offers only what the role may do: no card or adjustment for a sales manager', async () => {
    tokenStore.set(mockToken('pk', 'sales_manager'));
    const dialog = await openPayDialog(overdueInvoice());
    expect(within(dialog).queryByLabelText('Pay by card (Stripe)')).toBeNull();
    expect(within(dialog).queryByLabelText('Adjust the invoice amount')).toBeNull();
    expect(within(dialog).getByLabelText('Method')).toBeInTheDocument();
  });

  it('offers no payment at all to a role without payment permissions', async () => {
    tokenStore.set(mockToken('pk', 'support'));
    const row = overdueInvoice();
    renderApp(`/sales/${row.booking_id}`);
    const table = await screen.findByRole('table', { name: 'Scheduled invoices' });
    await within(table).findAllByText('Overdue');
    expect(within(table).queryByRole('button', { name: /Record payment/ })).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
