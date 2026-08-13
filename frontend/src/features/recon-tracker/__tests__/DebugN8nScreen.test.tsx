import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DebugN8nScreen } from '../screens/DebugN8nScreen';
import * as gateway from '../api/gateway';
import { ApiError } from '../api/client';
import type { GatewayRun } from '../types';

vi.mock('../api/gateway');

const FAILED: GatewayRun = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  workflow_definition_id: 'wf-1',
  target_id: 'tg-1',
  program_id: 'pg-1',
  n8n_execution_id: '4711',
  status: 'failed',
  started_at: '2026-08-10T11:00:00.000Z',
  finished_at: '2026-08-10T11:02:00.000Z',
  params: { workflow: 'recon-full-chain', target: 'example.org' },
  tool_execution_jobs: [
    {
      id: 'job-1',
      tool_name: 'pd-scan',
      status: 'error',
      leased_at: '2026-08-10T11:00:30.000Z',
      finished_at: '2026-08-10T11:01:00.000Z',
      error: 'nuclei exited 2: could not resolve host',
    },
  ],
  assets: [],
};

const CLEAN: GatewayRun = {
  id: 'bbbbbbbb-1111-2222-3333-444444444444',
  workflow_definition_id: 'wf-1',
  target_id: 'tg-1',
  program_id: 'pg-1',
  n8n_execution_id: '4712',
  status: 'success',
  started_at: '2026-08-10T10:00:00.000Z',
  finished_at: '2026-08-10T10:01:00.000Z',
  params: { workflow: 'recon-baseline', target: 'example.org' },
  tool_execution_jobs: [
    {
      id: 'job-2',
      tool_name: 'pd-recon',
      status: 'done',
      leased_at: '2026-08-10T10:00:10.000Z',
      finished_at: '2026-08-10T10:00:50.000Z',
      error: null,
    },
  ],
  assets: [],
};

beforeEach(() => {
  vi.mocked(gateway.fetchRuns).mockResolvedValue([FAILED, CLEAN]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the error report', () => {
  it('shows the error each execution produced, without being opened', async () => {
    render(<DebugN8nScreen />);
    expect(
      await screen.findByText(/nuclei exited 2: could not resolve host/),
    ).toBeInTheDocument();
  });

  it('says which layer raised it, so the operator knows where to look', async () => {
    render(<DebugN8nScreen />);
    await screen.findByText(/nuclei exited 2/);
    expect(screen.getByText('TES reported an error')).toBeInTheDocument();
    expect(screen.getByText('pd-scan')).toBeInTheDocument();
  });

  it('surfaces the n8n execution id, the handle that opens it in the editor', async () => {
    render(<DebugN8nScreen />);
    await screen.findByText(/nuclei exited 2/);
    expect(screen.getByText('4711')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy n8n execution id 4711/i }),
    ).toBeInTheDocument();
  });

  it('marks a clean execution as having nothing to debug', async () => {
    render(<DebugN8nScreen />);
    expect(await screen.findByText(/no errors recorded for this execution/i)).toBeInTheDocument();
  });
});

describe('filtering', () => {
  it('counts executions by verdict', async () => {
    render(<DebugN8nScreen />);
    const failing = await screen.findByRole('button', { name: /failing/i });
    expect(within(failing).getByText('1')).toBeInTheDocument();
  });

  it('narrows the list to failing executions', async () => {
    const user = userEvent.setup();
    render(<DebugN8nScreen />);
    await screen.findByText(/nuclei exited 2/);

    await user.click(screen.getByRole('button', { name: /failing/i }));

    expect(screen.getByText('recon-full-chain')).toBeInTheDocument();
    expect(screen.queryByText('recon-baseline')).not.toBeInTheDocument();
  });

  it('explains an empty filter without pretending there is no data', async () => {
    const user = userEvent.setup();
    render(<DebugN8nScreen />);
    await screen.findByText(/nuclei exited 2/);

    await user.click(screen.getByRole('button', { name: /degraded/i }));

    expect(screen.getByText(/no executions match this filter/i)).toBeInTheDocument();
  });
});

describe('tool jobs', () => {
  it('keeps the per-job detail one click away', async () => {
    const user = userEvent.setup();
    render(<DebugN8nScreen />);
    await screen.findByText(/nuclei exited 2/);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /show tool jobs/i })[0]);

    const table = within(screen.getByRole('table'));
    expect(table.getByText('pd-scan')).toBeInTheDocument();
  });
});

describe('when the gateway is unreachable', () => {
  it('says so instead of showing an empty debug screen', async () => {
    vi.mocked(gateway.fetchRuns).mockRejectedValue(
      new ApiError('Cannot reach the gateway. Is the stack running?', 0),
    );

    render(<DebugN8nScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the gateway/i);
  });
});

describe('staying current', () => {
  it('re-reads the executions on demand', async () => {
    const user = userEvent.setup();
    render(<DebugN8nScreen />);
    await screen.findByText(/nuclei exited 2/);

    await user.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => expect(gateway.fetchRuns).toHaveBeenCalledTimes(2));
  });

  it('polls without the operator having to ask', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<DebugN8nScreen />);
    await waitFor(() => expect(gateway.fetchRuns).toHaveBeenCalledTimes(1));

    // The poll resolves a fetch and sets state, so the tick has to happen
    // inside act() — otherwise React warns and the assertion races the render.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(gateway.fetchRuns).toHaveBeenCalledTimes(2);
  });
});
