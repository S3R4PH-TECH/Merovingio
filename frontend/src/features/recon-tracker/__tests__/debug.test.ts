import { describe, expect, it } from 'vitest';
import {
  countByLevel,
  diagnoseRun,
  diagnoseRuns,
  filterByLevel,
} from '../lib/debug';
import type { GatewayRun, ToolExecutionJob } from '../types';

const NOW = new Date('2026-08-10T12:00:00.000Z');

function job(overrides: Partial<ToolExecutionJob> = {}): ToolExecutionJob {
  return {
    id: 'job-1',
    tool_name: 'pd-recon',
    status: 'done',
    leased_at: '2026-08-10T11:59:00.000Z',
    finished_at: '2026-08-10T11:59:30.000Z',
    error: null,
    ...overrides,
  };
}

function run(overrides: Partial<GatewayRun> = {}): GatewayRun {
  return {
    id: 'run-1',
    workflow_definition_id: 'wf-1',
    target_id: 'tg-1',
    program_id: 'pg-1',
    n8n_execution_id: '4711',
    status: 'success',
    started_at: '2026-08-10T11:58:00.000Z',
    finished_at: '2026-08-10T11:59:45.000Z',
    params: { workflow: 'recon-baseline', target: 'example.org' },
    tool_execution_jobs: [job()],
    assets: [],
    ...overrides,
  };
}

describe('a healthy execution', () => {
  it('reports nothing to debug', () => {
    const result = diagnoseRun(run(), NOW);
    expect(result.issues).toEqual([]);
    expect(result.level).toBe('ok');
  });

  it('carries the identifiers needed to find it in n8n', () => {
    const result = diagnoseRun(run(), NOW);
    expect(result.executionId).toBe('4711');
    expect(result.workflow).toBe('recon-baseline');
    expect(result.target).toBe('example.org');
  });
});

describe('a TES that reported an error', () => {
  it('shows the tool\'s own message rather than a generic one', () => {
    const result = diagnoseRun(
      run({
        status: 'failed',
        tool_execution_jobs: [
          job({ status: 'error', error: 'nuclei: context deadline exceeded' }),
        ],
      }),
      NOW,
    );

    expect(result.level).toBe('error');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('tool_error');
    expect(result.issues[0].tool).toBe('pd-recon');
    expect(result.issues[0].message).toBe('nuclei: context deadline exceeded');
  });

  it('counts a job carrying a message even when its status did not update', () => {
    const result = diagnoseRun(
      run({ tool_execution_jobs: [job({ status: 'done', error: 'partial output' })] }),
      NOW,
    );
    expect(result.issues[0].kind).toBe('tool_error');
  });

  it('does not add a redundant n8n row when a tool already explained the failure', () => {
    const result = diagnoseRun(
      run({
        status: 'failed',
        tool_execution_jobs: [job({ status: 'error', error: 'boom' })],
      }),
      NOW,
    );
    expect(result.issues.map(issue => issue.kind)).toEqual(['tool_error']);
  });
});

describe('a failure that never reached n8n', () => {
  it('reads the webhook trigger error the gateway recorded', () => {
    const result = diagnoseRun(
      run({
        status: 'failed',
        n8n_execution_id: null,
        finished_at: null,
        tool_execution_jobs: [],
        error: 'Gateway could not reach the n8n production webhook: Connection refused',
        error_node: 'n8n production webhook',
      }),
      NOW,
    );

    expect(result.issues[0].kind).toBe('trigger_failed');
    expect(result.issues[0].message).toContain('Connection refused');
  });

  it('says so even when no message was recorded', () => {
    const result = diagnoseRun(
      run({ status: 'failed', n8n_execution_id: null, tool_execution_jobs: [] }),
      NOW,
    );

    expect(result.issues[0].kind).toBe('trigger_failed');
    expect(result.issues[0].hint).toMatch(/production_webhook_url/);
  });
});

describe('an n8n-side failure', () => {
  it('surfaces the message and the node that raised it', () => {
    const result = diagnoseRun(
      run({
        status: 'failed',
        tool_execution_jobs: [],
        error: 'Cannot read properties of undefined (reading \'hosts\')',
        error_node: 'Split subdomains',
      }),
      NOW,
    );

    expect(result.issues[0].kind).toBe('n8n_error');
    expect(result.issues[0].message).toContain('Cannot read properties');
    expect(result.issues[0].hint).toContain('Split subdomains');
  });

  it('names the execution to open when n8n sent no message at all', () => {
    const result = diagnoseRun(
      run({ status: 'failed', tool_execution_jobs: [] }),
      NOW,
    );

    expect(result.issues[0].kind).toBe('n8n_error');
    expect(result.issues[0].message).toContain('4711');
    // The fix is on the workflow side, so the hint has to say what to change.
    expect(result.issues[0].hint).toMatch(/error_node/);
  });
});

describe('a lost TES callback', () => {
  it('names every tool that never called back', () => {
    const result = diagnoseRun(
      run({
        status: 'completed_with_warnings',
        tool_execution_jobs: [
          job({ id: 'job-1', tool_name: 'pd-recon', status: 'done' }),
          job({ id: 'job-2', tool_name: 'fuzz-svc', status: 'leased', finished_at: null }),
        ],
      }),
      NOW,
    );

    expect(result.level).toBe('warning');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe('lost_callback');
    expect(result.issues[0].tool).toBe('fuzz-svc');
  });
});

describe('an execution still in flight', () => {
  it('stays quiet while the first node still has time to report', () => {
    const result = diagnoseRun(
      run({
        status: 'queued',
        n8n_execution_id: null,
        finished_at: null,
        tool_execution_jobs: [],
        started_at: '2026-08-10T11:59:50.000Z',
      }),
      NOW,
    );
    expect(result.issues).toEqual([]);
  });

  it('flags a run n8n never claimed', () => {
    const result = diagnoseRun(
      run({
        status: 'queued',
        n8n_execution_id: null,
        finished_at: null,
        tool_execution_jobs: [],
        started_at: '2026-08-10T11:50:00.000Z',
      }),
      NOW,
    );

    expect(result.issues[0].kind).toBe('no_execution_id');
    expect(result.issues[0].hint).toMatch(/execution-started/);
  });

  it('flags a job leased past every TES timeout', () => {
    const result = diagnoseRun(
      run({
        status: 'running',
        finished_at: null,
        tool_execution_jobs: [
          job({ status: 'leased', finished_at: null, leased_at: '2026-08-10T11:40:00.000Z' }),
        ],
      }),
      NOW,
    );

    expect(result.issues.map(issue => issue.kind)).toContain('stalled');
  });

  it('leaves a job inside its timeout window alone', () => {
    const result = diagnoseRun(
      run({
        status: 'running',
        finished_at: null,
        tool_execution_jobs: [
          job({ status: 'leased', finished_at: null, leased_at: '2026-08-10T11:58:00.000Z' }),
        ],
      }),
      NOW,
    );

    expect(result.issues).toEqual([]);
  });
});

describe('the execution list', () => {
  const items = diagnoseRuns(
    [
      run({ id: 'old', started_at: '2026-08-10T10:00:00.000Z' }),
      run({
        id: 'new',
        started_at: '2026-08-10T11:58:00.000Z',
        status: 'failed',
        tool_execution_jobs: [job({ status: 'error', error: 'boom' })],
      }),
    ],
    NOW,
  );

  it('puts the most recent execution first', () => {
    expect(items.map(item => item.runId)).toEqual(['new', 'old']);
  });

  it('counts executions by verdict', () => {
    expect(countByLevel(items)).toEqual({ all: 2, error: 1, warning: 0, ok: 1 });
  });

  it('filters down to one verdict', () => {
    expect(filterByLevel(items, 'error').map(item => item.runId)).toEqual(['new']);
    expect(filterByLevel(items, 'all')).toHaveLength(2);
  });
});
