import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScopePanel } from '../components/ScopePanel';
import * as gateway from '../api/gateway';
import { ApiError } from '../api/client';
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

function renderPanel(targets: TargetItem[] = []) {
  const onChanged = vi.fn();
  const utils = render(<ScopePanel targets={targets} onChanged={onChanged} />);
  return { onChanged, ...utils };
}

function stagedList() {
  return within(screen.getByRole('list', { name: /staged hosts/i }));
}

beforeEach(() => {
  vi.mocked(gateway.createTarget).mockResolvedValue(TARGET);
  vi.mocked(gateway.deleteTarget).mockResolvedValue(undefined);
});

describe('adding hosts one by one', () => {
  it('stages a typed host', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText(/host, domain or cidr/i), 'example.org');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(stagedList().getByText('example.org')).toBeInTheDocument();
  });

  it('stages on Enter without creating the target', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText(/host, domain or cidr/i), 'example.org{Enter}');

    expect(stagedList().getByText('example.org')).toBeInTheDocument();
    // Enter inside the field must not submit the surrounding form — the
    // operator is still building the list.
    expect(gateway.createTarget).not.toHaveBeenCalled();
  });

  it('clears the field so the next host can be typed straight away', async () => {
    const user = userEvent.setup();
    renderPanel();

    const field = screen.getByLabelText(/host, domain or cidr/i);
    await user.type(field, 'example.org{Enter}');

    expect(field).toHaveValue('');
  });
});

describe('pasting a list', () => {
  it('stages every host in one go', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /paste list/i }));
    await user.type(
      screen.getByLabelText(/paste hosts/i),
      'example.org{Enter}api.example.org{Enter}10.0.0.0/24',
    );
    await user.click(screen.getByRole('button', { name: /add pasted hosts/i }));

    const staged = stagedList();
    expect(staged.getByText('example.org')).toBeInTheDocument();
    expect(staged.getByText('api.example.org')).toBeInTheDocument();
    expect(staged.getByText('10.0.0.0/24')).toBeInTheDocument();
  });

  it('does not re-stage a host that is already there', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText(/host, domain or cidr/i), 'example.org{Enter}');
    await user.click(screen.getByRole('button', { name: /paste list/i }));
    await user.type(screen.getByLabelText(/paste hosts/i), 'example.org{Enter}new.example.org');
    await user.click(screen.getByRole('button', { name: /add pasted hosts/i }));

    expect(stagedList().getAllByText('example.org')).toHaveLength(1);
  });
});

describe('uploading a .txt', () => {
  it('stages the hosts the file contains', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /upload \.txt/i }));
    const file = new File(['example.org\napi.example.org\n'], 'hosts.txt', {
      type: 'text/plain',
    });
    await user.upload(screen.getByLabelText(/host list file/i), file);

    await waitFor(() => expect(stagedList().getByText('example.org')).toBeInTheDocument());
    expect(stagedList().getByText('api.example.org')).toBeInTheDocument();
  });

  it('reports what it imported, so a silent no-op is impossible to mistake', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /upload \.txt/i }));
    await user.upload(
      screen.getByLabelText(/host list file/i),
      new File(['a.com\nb.com'], 'hosts.txt', { type: 'text/plain' }),
    );

    expect(await screen.findByText(/hosts\.txt — 2 new hosts/i)).toBeInTheDocument();
  });
});

describe('reviewing what was staged', () => {
  it('says which field each host is headed for', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /paste list/i }));
    await user.type(screen.getByLabelText(/paste hosts/i), 'example.org 10.0.0.0/24');
    await user.click(screen.getByRole('button', { name: /add pasted hosts/i }));

    expect(screen.getByText(/1 domain · 1 network/i)).toBeInTheDocument();
  });

  it('flags an entry it could not place instead of dropping it', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /paste list/i }));
    await user.type(screen.getByLabelText(/paste hosts/i), 'example.org http://nope');
    await user.click(screen.getByRole('button', { name: /add pasted hosts/i }));

    expect(stagedList().getByText('http://nope')).toBeInTheDocument();
    expect(screen.getByText(/1 rejected/i)).toBeInTheDocument();
  });

  it('removes a single staged host', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText(/host, domain or cidr/i), 'example.org{Enter}');
    await user.click(screen.getByRole('button', { name: /remove example\.org/i }));

    expect(screen.queryByRole('list', { name: /staged hosts/i })).not.toBeInTheDocument();
  });
});

describe('creating the target', () => {
  async function stage(user: ReturnType<typeof userEvent.setup>, hosts: string) {
    await user.click(screen.getByRole('button', { name: /paste list/i }));
    await user.type(screen.getByLabelText(/paste hosts/i), hosts);
    await user.click(screen.getByRole('button', { name: /add pasted hosts/i }));
  }

  it('sends the hosts already sorted into domains and networks', async () => {
    const user = userEvent.setup();
    const { onChanged } = renderPanel();

    await user.type(screen.getByLabelText(/target name/i), 'Acme production');
    await stage(user, 'example.org 10.0.0.0/24 10.0.0.5');
    await user.type(screen.getByLabelText(/out of scope/i), 'admin.example.org');
    await user.click(screen.getByRole('button', { name: /create target/i }));

    await waitFor(() =>
      expect(gateway.createTarget).toHaveBeenCalledWith({
        name: 'Acme production',
        root_domains: ['example.org'],
        cidrs: ['10.0.0.0/24', '10.0.0.5'],
        out_of_scope: ['admin.example.org'],
      }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('requires a name', async () => {
    const user = userEvent.setup();
    renderPanel();

    await stage(user, 'example.org');
    await user.click(screen.getByRole('button', { name: /create target/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i);
    expect(gateway.createTarget).not.toHaveBeenCalled();
  });

  it('refuses a target with no scope at all', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText(/target name/i), 'Empty');
    await user.click(screen.getByRole('button', { name: /create target/i }));

    // A target with no scope authorises nothing; dispatching against it would
    // be a run that can never legally touch anything.
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one host/i);
    expect(gateway.createTarget).not.toHaveBeenCalled();
  });

  it('will not create a target while a rejected entry is still staged', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText(/target name/i), 'Acme');
    await stage(user, 'example.org http://nope');
    await user.click(screen.getByRole('button', { name: /create target/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/http:\/\/nope/);
    expect(gateway.createTarget).not.toHaveBeenCalled();
  });

  it('empties the staging list once the target exists', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText(/target name/i), 'Acme');
    await stage(user, 'example.org');
    await user.click(screen.getByRole('button', { name: /create target/i }));

    await waitFor(() =>
      expect(screen.queryByRole('list', { name: /staged hosts/i })).not.toBeInTheDocument(),
    );
  });
});

describe('current scope', () => {
  it('shows what the platform may already touch', () => {
    renderPanel([TARGET]);

    // Scoped to the list: the name also appears as an option in the scope
    // check below, which is correct but would make a bare query ambiguous.
    const registered = within(screen.getByRole('list', { name: /registered targets/i }));
    expect(registered.getByText('Acme production')).toBeInTheDocument();
    expect(registered.getByText('example.org, 10.0.0.0/24')).toBeInTheDocument();
    expect(registered.getByText(/except admin\.example\.org/i)).toBeInTheDocument();
  });

  it('says plainly that nothing can run when no target exists', () => {
    renderPanel([]);
    expect(screen.getByText(/nothing can be dispatched/i)).toBeInTheDocument();
  });
});

// Both of these moved here when the Scope & Targets page was removed. They are
// the reason that page could not simply be deleted: nothing else in the UI
// deregisters a target or asks the gateway to adjudicate a host.

describe('removing a target', () => {
  it('deregisters it', async () => {
    const user = userEvent.setup();
    const { onChanged } = renderPanel([TARGET]);

    await user.click(screen.getByRole('button', { name: /delete target acme production/i }));

    await waitFor(() => expect(gateway.deleteTarget).toHaveBeenCalledWith('tg-1'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('reports a refused delete instead of looking like it worked', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.deleteTarget).mockRejectedValue(new ApiError('insufficient_role', 403));
    renderPanel([TARGET]);

    await user.click(screen.getByRole('button', { name: /delete target acme production/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/insufficient_role/);
  });
});

describe('scope check', () => {
  it('reports an in-scope host', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.checkScope).mockResolvedValue({ value: 'www.example.org', in_scope: true });
    renderPanel([TARGET]);

    await user.selectOptions(screen.getByLabelText(/^target$/i), 'tg-1');
    await user.type(screen.getByLabelText(/host or ip/i), 'www.example.org');
    await user.click(screen.getByRole('button', { name: /check/i }));

    expect(await screen.findByText(/www\.example\.org is IN SCOPE/i)).toBeInTheDocument();
  });

  it('reports an out-of-scope host', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.checkScope).mockResolvedValue({ value: 'evil.com', in_scope: false });
    renderPanel([TARGET]);

    await user.selectOptions(screen.getByLabelText(/^target$/i), 'tg-1');
    await user.type(screen.getByLabelText(/host or ip/i), 'evil.com');
    await user.click(screen.getByRole('button', { name: /check/i }));

    expect(await screen.findByText(/evil\.com is OUT OF SCOPE/i)).toBeInTheDocument();
  });

  it('asks the gateway rather than answering from the staged list', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.checkScope).mockResolvedValue({ value: 'www.example.org', in_scope: true });
    renderPanel([TARGET]);

    await user.selectOptions(screen.getByLabelText(/^target$/i), 'tg-1');
    await user.type(screen.getByLabelText(/host or ip/i), '  www.example.org  ');
    await user.click(screen.getByRole('button', { name: /check/i }));

    // The gateway is the authority — it applies out_of_scope vetoes this
    // component's parser knows nothing about.
    await waitFor(() =>
      expect(gateway.checkScope).toHaveBeenCalledWith('tg-1', 'www.example.org'),
    );
  });

  it('does nothing until a target is picked', async () => {
    const user = userEvent.setup();
    renderPanel([TARGET]);

    await user.type(screen.getByLabelText(/host or ip/i), 'www.example.org');
    await user.click(screen.getByRole('button', { name: /check/i }));

    expect(gateway.checkScope).not.toHaveBeenCalled();
  });
});
