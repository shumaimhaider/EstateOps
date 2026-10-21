import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getDb, mockToken, tokenStore } from '@/test/mockServer.js';
import { renderApp } from '@/test/renderApp.jsx';

const activeBooking = () => {
  const db = getDb();
  return db.bookings.find((b) => b.tenant_id === db.tenants[0].id && b.status === 'active');
};

async function openBooking() {
  const booking = activeBooking();
  renderApp(`/sales/${booking.id}`);
  const section = await screen.findByRole('region', { name: 'Contracts' });
  await within(section).findByText('No contract yet');
  return { booking, section };
}

describe('contracts on a booking', () => {
  it('drafts a contract in PandaDoc, sends it, and shows it signed when the buyer signs', async () => {
    const { section } = await openBooking();
    await userEvent.click(within(section).getByRole('button', { name: 'Create with PandaDoc' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create contract in PandaDoc' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create draft' }));

    expect(await within(section).findByText('Sale agreement · version 1')).toBeInTheDocument();
    expect(within(section).getByText('Draft')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: /Open in PandaDoc/ })).toHaveAttribute(
      'href',
      expect.stringContaining('pandadoc.com'),
    );
    // only one contract can be open at a time
    expect(within(section).queryByRole('button', { name: 'Create with PandaDoc' })).toBeNull();

    await userEvent.click(within(section).getByRole('button', { name: 'Send for signing' }));
    expect(await within(section).findByText('Sent to sign')).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Mock: signer signed' }));
    expect(await within(section).findByText('Signed', { selector: 'span' })).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Revise' })).toBeNull();
    expect(within(section).queryByRole('button', { name: 'Upload signed contract' })).toBeNull();
  });

  it('revises an open contract into a new draft version', async () => {
    const { section } = await openBooking();
    await userEvent.click(within(section).getByRole('button', { name: 'Create with PandaDoc' }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Create contract in PandaDoc' })).getByRole(
        'button',
        { name: 'Create draft' },
      ),
    );
    await userEvent.click(await within(section).findByRole('button', { name: 'Revise' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revise contract' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create revision' }));
    expect(await within(dialog).findByText('Say what is being changed')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('What is changing'), 'Corrected price');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create revision' }));
    expect(await within(section).findByText('Sale agreement · version 2')).toBeInTheDocument();
    expect(within(section).getByText('Replaced')).toBeInTheDocument();
    expect(within(section).getByText('Corrected price')).toBeInTheDocument();
  });

  it('uploads the signed contract PDF', async () => {
    const { section } = await openBooking();
    await userEvent.click(within(section).getByRole('button', { name: 'Upload signed contract' }));
    const dialog = await screen.findByRole('dialog', { name: 'Upload signed contract' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload contract' }));
    expect(await within(dialog).findByText('Choose the signed contract PDF')).toBeInTheDocument();

    const file = new File(['%PDF-1.4'], 'signed-deed.pdf', { type: 'application/pdf' });
    await userEvent.upload(within(dialog).getByLabelText(/Signed contract \(PDF\)/), file);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload contract' }));

    expect(await screen.findByText('Signed contract uploaded')).toBeInTheDocument();
    expect(await within(section).findByText('Signed', { selector: 'span' })).toBeInTheDocument();
    expect(getDb().contracts.at(-1)).toMatchObject({ kind: 'signed_upload', status: 'signed' });
  });

  it('shows a sales agent the contracts but no way to change them', async () => {
    tokenStore.set(mockToken('pk', 'sales_agent'));
    const { section } = await openBooking();
    expect(within(section).queryByRole('button', { name: 'Create with PandaDoc' })).toBeNull();
    expect(within(section).queryByRole('button', { name: 'Upload signed contract' })).toBeNull();
  });

  it('shows no contracts section to a role without contracts.view', async () => {
    tokenStore.set(mockToken('pk', 'dealer_manager'));
    const booking = activeBooking();
    renderApp(`/sales/${booking.id}`);
    await screen.findByRole('table', { name: 'Scheduled invoices' });
    expect(screen.queryByRole('region', { name: 'Contracts' })).toBeNull();
  });
});
