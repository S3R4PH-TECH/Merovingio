import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileScreen } from '../screens/ProfileScreen';
import * as gateway from '../api/gateway';
import { ApiError } from '../api/client';
import type { MeResponse } from '../types';

vi.mock('../api/gateway');

const USER: MeResponse = {
  id: '3f1c9b52-0d84-4a17-9f2e-8c6b1a2d4e50',
  email: 'alex@example.com',
  name: 'Alex Morgan',
  avatar_url: null,
};

function renderScreen(user: Partial<MeResponse> = {}) {
  const merged = { ...USER, ...user };
  const onUpdateProfile = vi.fn().mockResolvedValue(merged);
  const utils = render(<ProfileScreen user={merged} onUpdateProfile={onUpdateProfile} />);
  return { onUpdateProfile, ...utils };
}

beforeEach(() => {
  vi.mocked(gateway.changePassword).mockResolvedValue(undefined);
});

describe('account details', () => {
  it('shows the name and the email', () => {
    renderScreen();
    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Alex Morgan');
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('alex@example.com');
  });

  it('will not let the email be edited — it is the login identity', () => {
    renderScreen();
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute('readonly');
    expect(screen.getByText(/cannot be changed here/i)).toBeInTheDocument();
  });

  it('keeps Save disabled until something actually changes', async () => {
    const user = userEvent.setup();
    renderScreen();

    const save = screen.getByRole('button', { name: /save changes/i });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/^name$/i), 'e');
    expect(save).toBeEnabled();
  });

  it('sends a trimmed name', async () => {
    const user = userEvent.setup();
    const { onUpdateProfile } = renderScreen();

    const field = screen.getByLabelText(/^name$/i);
    await user.clear(field);
    await user.type(field, '  Alex M  ');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledWith({ name: 'Alex M' }));
  });

  it('refuses to save a blank name', async () => {
    const user = userEvent.setup();
    const { onUpdateProfile } = renderScreen();

    await user.clear(screen.getByLabelText(/^name$/i));
    await user.type(screen.getByLabelText(/^name$/i), '   ');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i);
    expect(onUpdateProfile).not.toHaveBeenCalled();
  });

  it('confirms the save rather than leaving the operator guessing', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByLabelText(/^name$/i), 'e');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/profile saved/i);
  });

  it('surfaces a gateway rejection', async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn().mockRejectedValue(new ApiError('name too long', 422));
    render(<ProfileScreen user={USER} onUpdateProfile={onUpdateProfile} />);

    await user.type(screen.getByLabelText(/^name$/i), 'e');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/name too long/i);
  });
});

describe('profile photo', () => {
  it('falls back to initials when there is no photo', () => {
    renderScreen();
    expect(screen.getByText('AM')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the photo once there is one', () => {
    renderScreen({ avatar_url: 'https://cdn.example.org/alex.png' });
    expect(screen.getByRole('img', { name: /alex morgan's profile photo/i })).toHaveAttribute(
      'src',
      'https://cdn.example.org/alex.png',
    );
  });

  it('offers an upload control', () => {
    renderScreen();
    expect(screen.getByText(/upload photo/i)).toBeInTheDocument();
  });

  it('offers removal only when a photo exists', () => {
    const { unmount } = renderScreen();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    unmount();

    renderScreen({ avatar_url: 'https://cdn.example.org/alex.png' });
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('clears the photo with an empty string, not an omitted field', async () => {
    // Omission means "unchanged" to a PATCH, so it cannot express removal.
    const user = userEvent.setup();
    const { onUpdateProfile } = renderScreen({ avatar_url: 'https://cdn.example.org/alex.png' });

    await user.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledWith({ avatar_url: '' }));
  });

  it('rejects a file that is not an image before uploading anything', async () => {
    // applyAccept: false because accept="image/*" is a file-dialog hint, not a
    // guarantee — a drop or an "All files" pick still reaches the handler, so
    // the runtime check is what actually has to hold.
    const user = userEvent.setup({ applyAccept: false });
    const { onUpdateProfile } = renderScreen();

    const input = screen.getByText(/upload photo/i).querySelector('input') as HTMLInputElement;
    await user.upload(input, new File(['not an image'], 'notes.txt', { type: 'text/plain' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/pick an image file/i);
    expect(onUpdateProfile).not.toHaveBeenCalled();
  });
});

describe('changing the password', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, next = 'Brandnew1') {
    await user.type(screen.getByLabelText(/current password/i), 'Password123!');
    await user.type(screen.getByLabelText(/^new password$/i), next);
    await user.type(screen.getByLabelText(/confirm new password/i), next);
  }

  it('sends the current and the new password', async () => {
    const user = userEvent.setup();
    renderScreen();

    await fill(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() =>
      expect(gateway.changePassword).toHaveBeenCalledWith('Password123!', 'Brandnew1'),
    );
  });

  it('shows the same rules the signup screen does', () => {
    renderScreen();
    expect(screen.getByText('Contains a letter')).toBeInTheDocument();
    expect(screen.getByText('Contains a digit')).toBeInTheDocument();
    expect(screen.queryByText(/at least \d+ characters/i)).not.toBeInTheDocument();
  });

  it('accepts a short new password now the length floor is gone', async () => {
    const user = userEvent.setup();
    renderScreen();

    await fill(user, 'Ab1');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() =>
      expect(gateway.changePassword).toHaveBeenCalledWith('Password123!', 'Ab1'),
    );
  });

  it('refuses a new password that breaks a rule', async () => {
    const user = userEvent.setup();
    renderScreen();

    await fill(user, 'nodigitshere');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/does not meet every requirement/i);
    expect(gateway.changePassword).not.toHaveBeenCalled();
  });

  it('refuses when the confirmation does not match', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByLabelText(/current password/i), 'Password123!');
    await user.type(screen.getByLabelText(/^new password$/i), 'Brandnew1');
    await user.type(screen.getByLabelText(/confirm new password/i), 'Brandnew2');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(gateway.changePassword).not.toHaveBeenCalled();
  });

  it('says plainly that the current password was wrong', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.changePassword).mockRejectedValue(
      new ApiError('invalid_credentials', 401),
    );
    renderScreen();

    await fill(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not your current password/i);
  });

  it('explains a rate limit rather than showing the raw detail', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.changePassword).mockRejectedValue(new ApiError('too_many_attempts', 429));
    renderScreen();

    await fill(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
  });

  it('empties the fields once the change goes through', async () => {
    const user = userEvent.setup();
    renderScreen();

    await fill(user);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await screen.findByRole('status');
    expect(screen.getByLabelText(/current password/i)).toHaveValue('');
    expect(screen.getByLabelText(/^new password$/i)).toHaveValue('');
    expect(screen.getByLabelText(/confirm new password/i)).toHaveValue('');
  });

  it('never puts a password in a plain text field', () => {
    renderScreen();
    for (const label of [/current password/i, /^new password$/i, /confirm new password/i]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password');
    }
  });
});
