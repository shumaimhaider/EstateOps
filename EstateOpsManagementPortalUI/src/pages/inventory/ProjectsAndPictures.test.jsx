import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { getDb } from '@/test/mockServer.js';
import { renderApp } from '@/test/renderApp.jsx';

const pkUnit = (predicate) => {
  const db = getDb();
  return db.units.find((u) => u.tenant_id === db.tenants[0].id && predicate(u));
};

describe('projects and site map', () => {
  it('lists projects with live counts and a link to each map', async () => {
    const { container } = renderApp('/inventory/projects');
    const card = await screen.findByRole('article', { name: /Gulberg Greens/ });
    expect(within(card).getByRole('link', { name: 'Open site map' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Sold/ })).toHaveAttribute(
      'href',
      expect.stringContaining('status=sold'),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('draws one keyboard-operable shape per unit and opens the unit when selected', async () => {
    const db = getDb();
    const project = db.projects.find(
      (p) => p.name === 'Gulberg Greens' && p.tenant_id === db.tenants[0].id,
    );
    const { router } = renderApp(`/inventory/projects/${project.id}`);
    const map = await screen.findByRole('group', { name: 'Site plan of Gulberg Greens' });
    const shapes = within(map).getAllByRole('button');
    expect(shapes).toHaveLength(db.units.filter((u) => u.project_id === project.id).length);

    // legend filter dims everything but the chosen status
    await userEvent.click(screen.getByRole('button', { name: /^Sold \d+/ }));
    expect(screen.getByRole('button', { name: /^Sold \d+/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    shapes[0].focus();
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.pathname).toMatch(/^\/inventory\/units\/[0-9a-f-]{36}$/);
  });
});

describe('unit pictures and sale', () => {
  it('shows a picture gallery for a flat, with selectable thumbnails', async () => {
    const flat = pkUnit((u) => u.kind === 'flat');
    renderApp(`/inventory/units/${flat.id}`);
    const gallery = await screen.findByRole('region', { name: 'Pictures' });
    expect(within(gallery).getAllByRole('img')).toHaveLength(1); // main picture (thumbnails are buttons)
    const thumbs = within(gallery).getAllByRole('button');
    expect(thumbs).toHaveLength(4);
    await userEvent.click(thumbs[1]);
    expect(thumbs[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows pictures for a shop but never for a plot', async () => {
    const shop = pkUnit((u) => u.kind === 'shop');
    const first = renderApp(`/inventory/units/${shop.id}`);
    expect(await screen.findByRole('region', { name: 'Pictures' })).toBeInTheDocument();
    first.unmount();

    const plot = pkUnit((u) => u.kind === 'plot');
    renderApp(`/inventory/units/${plot.id}`);
    await screen.findByRole('heading', { level: 1, name: `Unit ${plot.unit_no}` });
    expect(screen.queryByRole('region', { name: 'Pictures' })).not.toBeInTheDocument();
  });

  it('shows the sale, received/pending and the full EMI schedule on a sold plot', async () => {
    const plot = pkUnit((u) => u.kind === 'plot' && u.booking_id && u.status === 'booked');
    const booking = getDb().bookings.find((b) => b.id === plot.booking_id);
    const rows = getDb().installments.filter((i) => i.booking_id === booking.id);
    renderApp(`/inventory/units/${plot.id}`);
    expect(await screen.findByRole('heading', { name: 'Sale & EMI schedule' })).toBeInTheDocument();
    expect(await screen.findByText('Installments scheduled')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Scheduled invoices' });
    expect(within(table).getAllByRole('row')).toHaveLength(rows.length + 1);
    expect(screen.getByText('Received')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});
