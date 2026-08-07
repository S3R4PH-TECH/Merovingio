import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterScreen, checkPasswordRules } from '../components/RegisterScreen';

function renderScreen(props: Partial<React.ComponentProps<typeof RegisterScreen>> = {}) {
  const onRegister = vi.fn().mockResolvedValue(undefined);
  const onShowLogin = vi.fn();
  const utils = render(
    <RegisterScreen
      onRegister={onRegister}
      onShowLogin={onShowLogin}
      error={null}
      {...props}
    />,
  );
  return { onRegister, onShowLogin, ...utils };
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/name/i), 'New Operator');
  await user.type(screen.getByLabelText(/email/i), 'new@example.com');
  await user.type(screen.getByLabelText(/^password$/i), 'CorrectHorse42!');
  await user.type(screen.getByLabelText(/confirm password/i), 'CorrectHorse42!');
}

describe('checkPasswordRules', () => {
  it('mirrors the gateway policy', () => {
    const labels = checkPasswordRules('').map(rule => rule.label);
    expect(labels).toEqual([
      'At least 12 characters',
      'Contains a letter',
      'Contains a digit',
      'At most 72 bytes',
    ]);
  });

  it('accepts a compliant password', () => {
    expect(checkPasswordRules('CorrectHorse42!').every(rule => rule.met)).toBe(true);
  });

  it('rejects one that is too short', () => {
    expect(checkPasswordRules('Short1!')[0].met).toBe(false);
  });

  it('rejects one with no digit', () => {
    expect(checkPasswordRules('nodigitsatallhere')[2].met).toBe(false);
  });

  it('rejects one with no letter', () => {
    expect(checkPasswordRules('1234567890123456')[1].met).toBe(false);
  });

  it('counts bytes, not characters, for the bcrypt ceiling', () => {
    // Multi-byte characters hit bcrypt's 72-byte limit well before 72 glyphs.
    const emoji = `a1${'🔒'.repeat(20)}`;
    expect(checkPasswordRules(emoji)[3].met).toBe(false);
  });
});

describe('RegisterScreen', () => {
  it('collects name, email and password', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('states up front that a new account has no access', () => {
    renderScreen();
    expect(screen.getByText(/no workspace and no program/i)).toBeInTheDocument();
  });

  it('shows the password rules before anything is typed', () => {
    renderScreen();
    expect(screen.getByText('At least 12 characters')).toBeInTheDocument();
    expect(screen.getByText('Contains a digit')).toBeInTheDocument();
  });

  it('ticks the rules live as the user types', async () => {
    const user = userEvent.setup();
    renderScreen();

    const rule = screen.getByText('At least 12 characters').closest('li');
    expect(rule).toHaveAttribute('data-met', 'false');

    await user.type(screen.getByLabelText(/^password$/i), 'CorrectHorse42!');

    expect(rule).toHaveAttribute('data-met', 'true');
  });

  it('submits a trimmed payload', async () => {
    const user = userEvent.setup();
    const { onRegister } = renderScreen();

    await user.type(screen.getByLabelText(/name/i), '  New Operator  ');
    await user.type(screen.getByLabelText(/email/i), '  new@example.com  ');
    await user.type(screen.getByLabelText(/^password$/i), 'CorrectHorse42!');
    await user.type(screen.getByLabelText(/confirm password/i), 'CorrectHorse42!');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() =>
      expect(onRegister).toHaveBeenCalledWith(
        'new@example.com',
        'CorrectHorse42!',
        'New Operator',
      ),
    );
  });

  it('requires a name', async () => {
    const user = userEvent.setup();
    const { onRegister } = renderScreen();

    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'CorrectHorse42!');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i);
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('refuses a password that fails the policy', async () => {
    const user = userEvent.setup();
    const { onRegister } = renderScreen();

    await user.type(screen.getByLabelText(/name/i), 'New Operator');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'short1');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/does not meet every requirement/i);
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('refuses when the confirmation does not match', async () => {
    const user = userEvent.setup();
    const { onRegister } = renderScreen();

    await user.type(screen.getByLabelText(/name/i), 'New Operator');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'CorrectHorse42!');
    await user.type(screen.getByLabelText(/confirm password/i), 'CorrectHorse99!');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('surfaces a gateway error', () => {
    renderScreen({ error: 'That email is already registered' });
    expect(screen.getByRole('alert')).toHaveTextContent(/already registered/i);
  });

  it('offers a way back to sign in', async () => {
    const user = userEvent.setup();
    const { onShowLogin } = renderScreen();
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(onShowLogin).toHaveBeenCalledOnce();
  });

  it('never puts the password in a plain text field', async () => {
    const user = userEvent.setup();
    renderScreen();
    await fillValid(user);

    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute('type', 'password');
  });
});
