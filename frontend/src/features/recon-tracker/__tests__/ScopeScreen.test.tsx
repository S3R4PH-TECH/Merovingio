import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScopeScreen } from '../screens/ScopeScreen';
import * as gateway from '../api/gateway';
import type { TargetItem } from '../types';

vi.mock('../api/gateway');

const TARGET: TargetItem = {
  id: 'tg-1',
  program_id: 'pg-1',
  name: 'Acme production',
  root_domains: ['example.org'],
  cidrs: ['10.0.0.0/24'],
  out_of_scope: ['admin.example.org'],
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(gateway.fetchTargets).mockResolvedValue([TARGET]);
  vi.mocked(gateway.createTarget).mockResolvedValue(TARGET);
  vi.mocked(gateway.deleteTarget).mockResolvedValue(undefined);
});

describe('adding a new target', () => {
  it('offers the field the operator asked for', async () => {
    render(<ScopeScreen />);
    expect(await screen.findByRole('heading', { name: /add new target/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/target name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/root domains/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cidrs/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/out of scope/i)).toBeInTheDocument();
  });

  it('sends the parsed scope to the gateway', async () => {
    const user = userEvent.setup();
    render(<ScopeScreen />);
    await screen.findByRole('heading', { name: /add new target/i });

    await user.type(screen.getByLabelText(/target name/i), 'Acme production');
    await user.type(screen.getByLabelText(/root domains/i), 'example.org, api.example.org');
    await user.type(screen.getByLabelText(/cidrs/i), '10.0.0.0/24');
    await user.type(screen.getByLabelText(/out of scope/i), 'admin.example.org');
    await user.click(screen.getByRole('button', { name: /add target/i }));

    await waitFor(() =>
      expect(gateway.createTarget).toHaveBeenCalledWith({
        name: 'Acme production',
        root_domains: ['example.org', 'api.example.org'],
        cidrs: ['10.0.0.0/24'],
        out_of_scope: ['admin.example.org'],
      }),
    );
  });

  it('requires a name', async () => {
    const user = userEvent.setup();
    render(<ScopeScreen />);
    await screen.findByRole('heading', { name: /add new target/i });

    await user.type(screen.getByLabelText(/root domains/i), 'example.org');
    await user.click(screen.getByRole('button', { name: /add target/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i);
    expect(gateway.createTarget).not.toHaveBeenCalled();
  });

  it('refuses a target with no scope at all', async () => {
    const user = userEvent.setup();
    render(<ScopeScreen />);
    await screen.findByRole('heading', { name: /add new target/i });

    await user.type(screen.getByLabelText(/target name/i), 'Empty');
    await user.click(screen.getByRole('button', { name: /add target/i }));

    // A target with no scope authorises nothing — dispatching against it would
    // be a run that can never legally touch anything.
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one root domain/i);
    expect(gateway.createTarget).not.toHaveBeenCalled();
  });

  it('flags malformed entries while typing', async () => {
    const user = userEvent.setup();
    render(<ScopeScreen />);
    await screen.findByRole('heading', { name: /add new target/i });

    await user.type(screen.getByLabelText(/root domains/i), 'not a domain!!');

    expect(await screen.findByText(/not a domain: not a domain!!/i)).toBeInTheDocument();
  });

  it('counts valid entries as they are entered', async () => {
    const user = userEvent.setup();
    render(<ScopeScreen />);
    await screen.findByRole('heading', { name: /add new target/i });

    await user.type(screen.getByLabelText(/root domains/i), 'a.com, b.com, c.com');

    expect(screen.getByLabelText(/root domains/i)).toHaveAccessibleName(
      expect.stringContaining('3'),
    );
  });
});

describe('registered targets', () => {
  it('lists what the platform is authorised to touch', async () => {
    render(<ScopeScreen />);
    const table = within(await screen.findByRole('table'));

    expect(table.getByText('Acme production')).toBeInTheDocument();
    expect(table.getByText('example.org')).toBeInTheDocument();
    expect(table.getByText('10.0.0.0/24')).toBeInTheDocument();
    expect(table.getByText('admin.example.org')).toBeInTheDocument();
  });

  it('explains the empty state', async () => {
    vi.mocked(gateway.fetchTargets).mockResolvedValue([]);
    render(<ScopeScreen />);
    expect(await screen.findByText(/no targets yet/i)).toBeInTheDocument();
  });

  it('deletes a target', async () => {
    const user = userEvent.setup();
    render(<ScopeScreen />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /delete target acme production/i }));

    await waitFor(() => expect(gateway.deleteTarget).toHaveBeenCalledWith('tg-1'));
  });
});

describe('scope check', () => {
  it('reports an in-scope host', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.checkScope).mockResolvedValue({ value: 'www.example.org', in_scope: true });

    render(<ScopeScreen />);
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText(/^target$/i), 'tg-1');
    await user.type(screen.getByLabelText(/host or ip/i), 'www.example.org');
    await user.click(screen.getByRole('button', { name: /check/i }));

    expect(await screen.findByText(/www\.example\.org is IN SCOPE/i)).toBeInTheDocument();
  });

  it('reports an out-of-scope host', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.checkScope).mockResolvedValue({
      value: 'evil.com',
      in_scope: false,
    });

    render(<ScopeScreen />);
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText(/^target$/i), 'tg-1');
    await user.type(screen.getByLabelText(/host or ip/i), 'evil.com');
    await user.click(screen.getByRole('button', { name: /check/i }));

    expect(await screen.findByText(/evil\.com is OUT OF SCOPE/i)).toBeInTheDocument();
  });
});
