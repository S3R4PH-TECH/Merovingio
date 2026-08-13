import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReconTracker } from '../ReconTracker';
import * as gateway from '../api/gateway';
import type { GatewayRun, TargetItem, WorkflowItem } from '../types';

// The api module is the seam. Mocking it keeps every screen test free of
// fetch stubbing while still exercising the real components end to end.
vi.mock('../api/gateway');

const NOW = new Date('2026-08-07T18:00:00.000Z');

const ME = { id: 'u1', email: 'op@example.com', name: 'Alex Morgan', avatar_url: null };

// Real UUIDs, because the gateway's /runs/{run_id} route is typed `UUID` and
// rejects anything else with a 422 before the handler runs. Placeholder ids
// like 'run-a' made these tests pass against a request production would never
// have accepted — the same mismatch that surfaced as "Input should be a valid
// UUID, invalid character: found `r` at 1" on demo mode's sample runs.
const RUN_A = '3f1c9b52-0d84-4a17-9f2e-8c6b1a2d4e50';
const RUN_B = '7a2d4e50-9f2e-4a17-0d84-3f1c9b52c6b1';
const RUN_C = 'c6b13f1c-4a17-9b52-0d84-8c6b1a2d4e50';

const WORKFLOWS: WorkflowItem[] = [
  {
    id: 'wf-1',
    workspace_id: 'ws-1',
    name: 'recon-baseline',
    git_path: 'workflows/recon-baseline.json',
    current_version: '1',
    production_webhook_url: 'http://n8n-main:5678/webhook/abc',
    created_at: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'wf-2',
    workspace_id: 'ws-1',
    name: 'recon-full-chain',
    git_path: 'workflows/recon-full-chain.json',
    current_version: '2',
    production_webhook_url: 'http://n8n-main:5678/webhook/def',
    created_at: '2026-08-01T00:00:00.000Z',
  },
];

const TARGETS: TargetItem[] = [
  {
    id: 'tg-1',
    program_id: 'pg-1',
    name: 'Acme production',
    root_domains: ['example.org'],
    cidrs: [],
    out_of_scope: [],
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
];

const RUNS: GatewayRun[] = [
  {
    id: RUN_A,
    workflow_definition_id: 'wf-1',
    target_id: 'tg-1',
    program_id: 'pg-1',
    status: 'success',
    started_at: '2026-08-06T10:00:00.000Z',
    finished_at: '2026-08-06T10:12:00.000Z',
    params: { workflow: 'recon-baseline', target: 'example.org' },
    tool_execution_jobs: [{ id: 'j1', tool_name: 'theharvester', status: 'success', leased_at: '2026-08-06T10:00:00.000Z' }],
    assets: [{ id: 'a1', type: 'subdomain', value: 'www.example.org', source_tool: 'theharvester' }],
  },
  {
    id: RUN_B,
    workflow_definition_id: 'wf-1',
    target_id: 'tg-1',
    program_id: 'pg-1',
    status: 'running',
    started_at: '2026-08-07T09:00:00.000Z',
    params: { workflow: 'recon-full-chain', target: 'scanme.nmap.org' },
    tool_execution_jobs: [{ id: 'j2', tool_name: 'net-scan', status: 'leased', leased_at: '2026-08-07T09:00:00.000Z' }],
    assets: [],
  },
];

beforeEach(() => {
  window.location.hash = '#/overview';
  localStorage.setItem('rt-token', 'fake-jwt');

  vi.mocked(gateway.fetchMe).mockResolvedValue(ME);
  vi.mocked(gateway.fetchRuns).mockResolvedValue(RUNS);
  vi.mocked(gateway.fetchWorkflows).mockResolvedValue(WORKFLOWS);
  vi.mocked(gateway.fetchTargets).mockResolvedValue(TARGETS);
  vi.mocked(gateway.triggerRun).mockResolvedValue({ run_id: RUN_C, status: 'queued' });
  vi.mocked(gateway.logout).mockImplementation(() => localStorage.removeItem('rt-token'));
});

async function renderApp() {
  const utils = render(<ReconTracker now={NOW} />);
  await screen.findByRole('navigation', { name: /main navigation/i });
  return utils;
}

describe('authentication gate', () => {
  it('shows the login screen when there is no token', async () => {
    localStorage.removeItem('rt-token');
    render(<ReconTracker now={NOW} />);

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('falls back to login when the stored token is rejected', async () => {
    vi.mocked(gateway.fetchMe).mockRejectedValue(new Error('401'));
    render(<ReconTracker now={NOW} />);

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('signs in and reaches the dashboard', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('rt-token');
    vi.mocked(gateway.login).mockResolvedValue('fake-jwt');

    render(<ReconTracker now={NOW} />);
    await screen.findByRole('heading', { name: /sign in/i });

    await user.type(screen.getByLabelText(/email/i), 'op@example.com');
    await user.type(screen.getByLabelText(/password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
    expect(gateway.login).toHaveBeenCalledWith('op@example.com', 'secret');
  });

  it('greets the authenticated user by name', async () => {
    await renderApp();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Alex Morgan');
  });

  it('offers a way to create an account from the login screen', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('rt-token');
    render(<ReconTracker now={NOW} />);
    await screen.findByRole('heading', { name: /sign in/i });

    await user.click(screen.getByRole('button', { name: /create one/i }));

    expect(await screen.findByRole('heading', { name: /create account/i })).toBeInTheDocument();
  });

  it('registers and lands straight in the dashboard', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('rt-token');
    vi.mocked(gateway.register).mockResolvedValue('fake-jwt');

    render(<ReconTracker now={NOW} />);
    await screen.findByRole('heading', { name: /sign in/i });
    await user.click(screen.getByRole('button', { name: /create one/i }));
    await screen.findByRole('heading', { name: /create account/i });

    await user.type(screen.getByLabelText(/name/i), 'New Operator');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'CorrectHorse42!');
    await user.type(screen.getByLabelText(/confirm password/i), 'CorrectHorse42!');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
    expect(gateway.register).toHaveBeenCalledWith(
      'new@example.com',
      'CorrectHorse42!',
      'New Operator',
    );
  });

  it('explains when the gateway has registration switched off', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('rt-token');
    const { ApiError } = await import('../api/client');
    vi.mocked(gateway.register).mockRejectedValue(new ApiError('registration_disabled', 403));

    render(<ReconTracker now={NOW} />);
    await screen.findByRole('heading', { name: /sign in/i });
    await user.click(screen.getByRole('button', { name: /create one/i }));

    await user.type(screen.getByLabelText(/name/i), 'New Operator');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'CorrectHorse42!');
    await user.type(screen.getByLabelText(/confirm password/i), 'CorrectHorse42!');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/GATEWAY_ALLOW_REGISTRATION/i);
  });

  it('signs out back to the login screen', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: /log out/i }));

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });
});

describe('overview shows what an operator opens the page for', () => {
  it('lists the registered workflows', async () => {
    await renderApp();
    const panel = screen.getByRole('region', { name: /^workflows$/i });

    expect(within(panel).getByText('recon-baseline')).toBeInTheDocument();
    expect(within(panel).getByText('recon-full-chain')).toBeInTheDocument();
    expect(within(panel).getByText('workflows/recon-baseline.json')).toBeInTheDocument();
  });

  it('offers a run button per workflow', async () => {
    await renderApp();
    const panel = screen.getByRole('region', { name: /^workflows$/i });
    expect(within(panel).getAllByRole('button', { name: /^run$/i })).toHaveLength(2);
  });

  it('explains the empty state instead of showing a blank panel', async () => {
    vi.mocked(gateway.fetchWorkflows).mockResolvedValue([]);
    await renderApp();
    expect(await screen.findByText(/no workflows registered yet/i)).toBeInTheDocument();
  });

  it('lists runs that already happened or are happening', async () => {
    await renderApp();
    const panel = await screen.findByRole('region', { name: /recent & active runs/i });

    expect(within(panel).getByText('recon-baseline')).toBeInTheDocument();
    expect(within(panel).getByText('recon-full-chain')).toBeInTheDocument();
    expect(within(panel).getByText('Success')).toBeInTheDocument();
    expect(within(panel).getByText('Running')).toBeInTheDocument();
  });

  it('still renders the KPIs and the three charts', async () => {
    await renderApp();
    expect(screen.getByRole('article', { name: 'Total Runs' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /run volume/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /run status/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /runs by tool/i })).toBeInTheDocument();
  });

  it('counts real runs from the gateway, not sample data', async () => {
    await renderApp();
    const total = within(screen.getByRole('article', { name: 'Total Runs' })).getByTestId(
      'kpi-value',
    );
    expect(total).toHaveTextContent('2');
  });

  // A bug report described the period tabs, the recent-runs panel and both
  // charts as appearing several times over. They are each mounted once here;
  // these assertions are what would catch it if that ever stopped being true.
  it('draws each panel exactly once', async () => {
    await renderApp();

    expect(screen.getAllByRole('tablist', { name: /time period/i })).toHaveLength(1);
    expect(screen.getAllByRole('region', { name: /recent & active runs/i })).toHaveLength(1);
    expect(screen.getAllByRole('img', { name: /run volume/i })).toHaveLength(1);
    expect(screen.getAllByRole('img', { name: /runs by tool/i })).toHaveLength(1);
  });

  it('no longer offers a program picker in the header', async () => {
    await renderApp();
    expect(screen.queryByRole('button', { name: /program:/i })).not.toBeInTheDocument();
  });
});

describe('runs screens', () => {
  it('lists every run under All Runs', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('link', { name: 'All Runs' }));

    expect(await screen.findByRole('heading', { name: 'All Runs', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /open run/i })).toHaveLength(2);
  });

  it('narrows Active Runs to what is in flight', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('link', { name: 'Active Runs' }));

    await screen.findByRole('heading', { name: 'Active Runs', level: 1 });
    expect(screen.getAllByRole('button', { name: /open run/i })).toHaveLength(1);
  });

  it('puts scope beside the executions on All Runs', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('link', { name: 'All Runs' }));
    await screen.findByRole('heading', { name: 'All Runs', level: 1 });

    expect(screen.getByRole('heading', { name: 'Scope', level: 2 })).toBeInTheDocument();
    // All three ways of getting hosts in are reachable from here.
    for (const mode of [/one by one/i, /paste list/i, /upload \.txt/i]) {
      expect(screen.getByRole('button', { name: mode })).toBeInTheDocument();
    }
    // Already-registered scope is visible without leaving the page.
    const registered = within(screen.getByRole('list', { name: /registered targets/i }));
    expect(registered.getByText('Acme production')).toBeInTheDocument();
    // And the guardrail that used to live on the Scope page came along.
    expect(screen.getByRole('button', { name: /check/i })).toBeInTheDocument();
  });

  it('keeps scope off Active Runs, which is for watching rather than configuring', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('link', { name: 'Active Runs' }));
    await screen.findByRole('heading', { name: 'Active Runs', level: 1 });

    expect(screen.queryByRole('heading', { name: 'Scope', level: 2 })).not.toBeInTheDocument();
  });

  it('opens the run detail with hosts and tool jobs', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.fetchRun).mockResolvedValue(RUNS[0]);
    vi.mocked(gateway.fetchRunHosts).mockResolvedValue({
      run_id: RUN_A,
      total_hosts: 1,
      hosts: [{ host: 'www.example.org', asset_count: 83, tools: ['theharvester'] }],
    });

    await renderApp();
    await user.click(screen.getByRole('link', { name: 'All Runs' }));
    await user.click((await screen.findAllByRole('button', { name: /open run/i }))[0]);

    expect(await screen.findByText('www.example.org')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /hosts discovered/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /tool executions/i })).toBeInTheDocument();
  });

  it('loads the raw tool output on demand', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.fetchRun).mockResolvedValue(RUNS[0]);
    vi.mocked(gateway.fetchRunHosts).mockResolvedValue({
      run_id: RUN_A,
      total_hosts: 1,
      hosts: [{ host: 'www.example.org', asset_count: 83, tools: ['theharvester'] }],
    });
    vi.mocked(gateway.fetchHostOutput).mockResolvedValue('www.example.org\nmail.example.org');

    await renderApp();
    await user.click(screen.getByRole('link', { name: 'All Runs' }));
    await user.click((await screen.findAllByRole('button', { name: /open run/i }))[0]);
    await user.click(await screen.findByRole('button', { name: /output/i }));

    expect(await screen.findByText(/mail\.example\.org/)).toBeInTheDocument();
  });
});

describe('dispatching a real run', () => {
  it('sends the workflow and target to the gateway', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: /new run/i }));

    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText(/workflow/i), 'wf-2');
    await user.selectOptions(dialog.getByLabelText(/target/i), 'tg-1');
    await user.click(dialog.getByRole('button', { name: /dispatch run/i }));

    await waitFor(() => expect(gateway.triggerRun).toHaveBeenCalledWith('wf-2', 'tg-1'));
  });

  it('refuses to dispatch without a target', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.fetchTargets).mockResolvedValue([]);
    await renderApp();

    await user.click(screen.getByRole('button', { name: /new run/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: /dispatch run/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/select a target/i);
    expect(gateway.triggerRun).not.toHaveBeenCalled();
  });

  it('surfaces a gateway rejection instead of closing silently', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.triggerRun).mockRejectedValue(new Error('target_out_of_scope'));
    await renderApp();

    await user.click(screen.getByRole('button', { name: /new run/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: /dispatch run/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/target_out_of_scope/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('demo mode', () => {
  it('stands in with sample data when the gateway has no runs', async () => {
    vi.mocked(gateway.fetchRuns).mockResolvedValue([]);
    await renderApp();

    expect(await screen.findByRole('status')).toHaveTextContent(/demo mode/i);
  });

  it('stays quiet when the runs are real', async () => {
    await renderApp();
    await waitFor(() =>
      expect(screen.queryByText('Demo Mode')).not.toBeInTheDocument(),
    );
  });

  /**
   * Sample runs carry ids like `run-1010`, which the gateway's `/runs/{run_id}`
   * route rejects as a malformed UUID before the handler is reached. Opening
   * one used to relay that verbatim — "Input should be a valid UUID, invalid
   * character: found `r` at 1" — which names neither demo mode nor the row
   * that was clicked, and which several people read as an n8n fault.
   */
  it('explains a sample run instead of relaying a UUID parse error', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.fetchRuns).mockResolvedValue([]);
    await renderApp();

    await user.click(screen.getByRole('link', { name: 'All Runs' }));
    const rows = await screen.findAllByRole('button', { name: /^open run/i });
    await user.click(rows[0]);

    expect(await screen.findByRole('heading', { name: /sample run/i })).toBeInTheDocument();
    expect(screen.getByText(/only in this browser/i)).toBeInTheDocument();
    expect(screen.queryByText(/valid uuid/i)).not.toBeInTheDocument();
  });

  it('never asks the gateway for a sample run', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.fetchRuns).mockResolvedValue([]);
    await renderApp();

    await user.click(screen.getByRole('link', { name: 'All Runs' }));
    const rows = await screen.findAllByRole('button', { name: /^open run/i });
    await user.click(rows[0]);

    await screen.findByRole('heading', { name: /sample run/i });
    expect(gateway.fetchRun).not.toHaveBeenCalled();
    expect(gateway.fetchRunHosts).not.toHaveBeenCalled();
  });
});

describe('the profile page', () => {
  it('is reachable from the sidebar', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('link', { name: 'Profile' }));

    expect(await screen.findByRole('heading', { name: /^profile$/i })).toBeInTheDocument();
  });

  it('is filled in from the signed in account', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('link', { name: 'Profile' }));

    expect(await screen.findByLabelText(/^name$/i)).toHaveValue('Alex Morgan');
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('op@example.com');
  });

  it('sends a rename through and shows it in the sidebar', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.updateProfile).mockResolvedValue({ ...ME, name: 'Alex M' });
    await renderApp();
    await user.click(screen.getByRole('link', { name: 'Profile' }));

    const field = await screen.findByLabelText(/^name$/i);
    await user.clear(field);
    await user.type(field, 'Alex M');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(gateway.updateProfile).toHaveBeenCalledWith({ name: 'Alex M' }));
    // The sidebar footer reads from the same `user`, so a stale name there
    // would mean the write never reached the shell's state.
    expect(await screen.findByText('Alex M')).toBeInTheDocument();
  });

  it('survives a deep link straight to #/profile', async () => {
    window.location.hash = '#/profile';
    await renderApp();
    expect(await screen.findByRole('heading', { name: /^profile$/i })).toBeInTheDocument();
  });
});
