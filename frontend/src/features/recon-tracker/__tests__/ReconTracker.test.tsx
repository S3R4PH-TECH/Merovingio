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

const ME = { id: 'u1', email: 'op@example.com', name: 'Alex Morgan' };

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
    id: 'run-a',
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
    id: 'run-b',
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
  vi.mocked(gateway.triggerRun).mockResolvedValue({ run_id: 'run-c', status: 'queued' });
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

  it('opens the run detail with hosts and tool jobs', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.fetchRun).mockResolvedValue(RUNS[0]);
    vi.mocked(gateway.fetchRunHosts).mockResolvedValue({
      run_id: 'run-a',
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
      run_id: 'run-a',
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
});
