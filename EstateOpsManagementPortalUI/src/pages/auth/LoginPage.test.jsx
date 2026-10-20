import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { tokenStore } from '@/test/mockServer.js';
import { renderApp } from '@/test/renderApp.jsx';

beforeEach(() => tokenStore.clear());

const dashboardHeading = () => screen.findByRole('heading', { level: 1, name: /Welcome back, /i });

describe('sign-in', () => {
  it('sends signed-out users to login and remembers where they were going', async () => {
    const { router } = renderApp('/customers');
    expect(await screen.findByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state.from).toBe('/customers');
  });

  it('has no axe violations on the login page', async () => {
    const { container } = renderApp('/login');
    await screen.findByRole('button', { name: /Continue with Google/ });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('signs in with Google through the account chooser and lands on the dashboard', async () => {
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: /Continue with Google/ }));
    const chooser = await screen.findByRole('dialog', { name: 'Choose a Google account' });
    await userEvent.click(
      await within(chooser).findByRole('button', { name: /owner@pk\.estateops\.test/ }),
    );
    expect(await dashboardHeading()).toBeInTheDocument();
    expect(await screen.findByText('Zameen Developers')).toBeInTheDocument();
  });

  it('refuses a Google account that is not registered staff', async () => {
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: /Continue with Google/ }));
    const chooser = await screen.findByRole('dialog', { name: 'Choose a Google account' });
    await userEvent.click(
      await within(chooser).findByRole('button', { name: /Use another account/ }),
    );
    expect(await screen.findByText(/not registered as staff/)).toBeInTheDocument();
  });

  it('signs in with email, password and a 2FA code, showing server errors inline', async () => {
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'finance@pk.estateops.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Email or password is incorrect')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await userEvent.type(await screen.findByLabelText('Verification code'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await screen.findByText('That code is not valid')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Verification code'));
    await userEvent.type(screen.getByLabelText('Verification code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await dashboardHeading()).toBeInTheDocument();
    expect(screen.getByText(/Finance · Zameen Developers/)).toBeInTheDocument();
  });

  it('shows client validation before calling the API', async () => {
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('one-click quick sign-in signs in a seeded user of the other tenant', async () => {
    renderApp('/login');
    const group = await screen.findByRole('region', { name: 'Desert Rose Properties' });
    await userEvent.click(within(group).getAllByRole('button')[0]);
    expect(await dashboardHeading()).toBeInTheDocument();
    expect((await screen.findAllByText(/Desert Rose Properties/)).length).toBeGreaterThan(0);
  });

  it('signs out and returns to login', async () => {
    tokenStore.set('mock.pk.owner');
    const { router } = renderApp('/');
    await dashboardHeading();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(tokenStore.getAccess()).toBeNull();
  });
});
