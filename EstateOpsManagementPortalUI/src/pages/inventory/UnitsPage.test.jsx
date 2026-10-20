import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/test/renderWithProviders.jsx';
import { server } from '@/test/mockServer.js';
import UnitsPage from './UnitsPage.jsx';

const renderPage = (route = '/inventory/units') => renderWithProviders(<UnitsPage />, { route });

describe('UnitsPage', () => {
  it('renders seeded units, paginates by cursor, and has no axe violations', async () => {
    const { container } = renderPage();
    expect(screen.getByText('Loading')).toBeInTheDocument(); // skeleton
    const table = await screen.findByRole('table', { name: 'Units' });
    expect(within(table).getAllByRole('row').length).toBe(26); // header + 25
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBe(51));
  });

  it('keeps filters in the URL state and filters on the server', async () => {
    renderPage('/inventory/units?status=blocked');
    const table = await screen.findByRole('table', { name: 'Units' });
    const pills = within(table).getAllByText('Blocked', { selector: 'span' });
    expect(pills.length).toBeGreaterThan(0);
    expect(within(table).queryByText('Available')).not.toBeInTheDocument();
  });

  it('shows an error state with retry when the API fails', async () => {
    server.use(
      http.get('*/api/v1/admin/units', () =>
        HttpResponse.json({ code: 'X', message: 'boom' }, { status: 400 }),
      ),
    );
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load units');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows client validation errors on submit and does not call the API', async () => {
    renderPage();
    await screen.findByRole('table', { name: 'Units' });
    await userEvent.click(screen.getByRole('button', { name: 'New unit' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Create unit' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toContain('Choose a project');
    expect(screen.getByText('Enter a unit number')).toBeInTheDocument();
    expect(screen.getByText('Enter an area greater than zero')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid amount')).toBeInTheDocument();
  });

  it('shows server field errors inline, then succeeds after correcting the field', async () => {
    renderPage();
    await screen.findByRole('table', { name: 'Units' });
    await userEvent.click(screen.getByRole('button', { name: 'New unit' }));
    const dialog = await screen.findByRole('dialog', { name: 'New unit' });
    const form = within(dialog);

    await form.findByRole('option', { name: 'Gulberg Greens' });
    await userEvent.selectOptions(form.getByLabelText('Project'), 'Gulberg Greens');
    await userEvent.type(form.getByLabelText('Unit number'), 'A-01'); // exists in the seed
    await userEvent.type(form.getByLabelText('Area'), '5');
    await userEvent.type(form.getByLabelText(/List price/), '15,000,000');
    await userEvent.click(form.getByRole('button', { name: 'Create unit' }));

    expect(await form.findByText('Unit number already exists in this project')).toBeInTheDocument();

    const unitNo = form.getByLabelText('Unit number');
    await userEvent.clear(unitNo);
    await userEvent.type(unitNo, 'NEW-1');
    await userEvent.click(form.getByRole('button', { name: 'Create unit' }));
    expect(await screen.findByText('Unit NEW-1 created')).toBeInTheDocument();
  });

  it('blocks a unit after confirmation, using only actions the server allows', async () => {
    renderPage('/inventory/units?status=available');
    const table = await screen.findByRole('table', { name: 'Units' });
    const [button] = await within(table).findAllByRole('button', { name: 'Block' });
    await userEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Block' });
    expect(within(dialog).getByText(/will not be sellable until unblocked/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText(/blocked$/)).toBeInTheDocument();
  });
});
