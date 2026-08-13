/**
 * Turns a gateway Run into the list of things that went wrong in it.
 *
 * The gateway records failure in four unrelated places — Run.status,
 * Run.error, ToolExecutionJob.status and ToolExecutionJob.error — and none of
 * them alone says what an operator should go and look at. The interesting
 * cases are the ones where no field holds an error message at all:
 *
 *   * a Run stuck in "queued" is a workflow n8n never picked up;
 *   * a Run with no n8n_execution_id never ran /internal/execution-started;
 *   * "completed_with_warnings" means n8n finished green while a TES callback
 *     was silently lost (ARCHITECTURE_AND_ROADMAP.md section 10).
 *
 * Each of those is a different thing to fix, so each gets its own issue kind
 * and its own hint. Pure functions, no fetching: the screen renders whatever
 * this returns and the rules stay testable without a gateway.
 */
import { formatDuration } from './format';
import type { GatewayRun, ToolExecutionJob } from '../types';

/** The two statuses /internal/n8n-callback treats as "this job is over". */
const TERMINAL_JOB_STATUSES: readonly string[] = ['done', 'error'];

/**
 * How long a Run may sit without an n8n execution id before that is a
 * symptom rather than a race. The trigger and the workflow's first node are
 * two HTTP hops apart, so a second or two is normal; a minute is not.
 */
const EXECUTION_ID_GRACE_MS = 60_000;

/**
 * How long a job may stay leased before we call it stuck. tes_registry
 * defaults timeout_seconds to 200, so anything past five minutes has outlived
 * every timeout the platform ships with — the TES is not slow, it is gone.
 */
const LEASE_GRACE_MS = 300_000;

/**
 * The sentinel routers/workflows.py writes into Run.error_node when the
 * Gateway could not reach production_webhook_url at all. It is the one value
 * that never names a real n8n node, and it is what separates "n8n rejected
 * this" from "n8n was never asked" — two failures with completely different
 * fixes that would otherwise look identical here.
 */
const WEBHOOK_TRIGGER_NODE = 'n8n production webhook';

export type IssueKind =
  | 'trigger_failed'
  | 'n8n_error'
  | 'tool_error'
  | 'lost_callback'
  | 'no_execution_id'
  | 'stalled';

/** 'error' means it already failed; 'warning' means it is failing quietly. */
export type IssueLevel = 'error' | 'warning';

export interface ExecutionIssue {
  kind: IssueKind;
  level: IssueLevel;
  /** Set when the issue belongs to one tool rather than the whole execution. */
  tool?: string;
  /** What happened, preferring the platform's own words over ours. */
  message: string;
  /** Where to look next — the part that is not inferable from the message. */
  hint: string;
}

export type ExecutionLevel = IssueLevel | 'ok';

export interface ExecutionDebug {
  runId: string;
  /** Null until the workflow's first node calls /internal/execution-started. */
  executionId: string | null;
  workflow: string;
  target: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  jobs: ToolExecutionJob[];
  params: Record<string, unknown>;
  issues: ExecutionIssue[];
  level: ExecutionLevel;
}

export const ISSUE_LABELS: Record<IssueKind, string> = {
  trigger_failed: 'Never reached n8n',
  n8n_error: 'n8n execution error',
  tool_error: 'TES reported an error',
  lost_callback: 'Lost TES callback',
  no_execution_id: 'No execution id',
  stalled: 'Stuck job',
};

function readParam(params: Record<string, unknown> | null | undefined, key: string): string {
  const value = params?.[key];
  return typeof value === 'string' && value !== '' ? value : '';
}

function isTerminal(job: ToolExecutionJob): boolean {
  return TERMINAL_JOB_STATUSES.includes(job.status);
}

/** Milliseconds since an ISO timestamp, or null when it is unparseable. */
function ageMs(iso: string, now: Date): number | null {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : now.getTime() - at;
}

function toolErrors(jobs: ToolExecutionJob[]): ExecutionIssue[] {
  // A job can carry an error message without its status saying "error" (the
  // TES sets both, but only `error` survives a partial callback), so either
  // one is enough to count as a failure worth showing.
  return jobs
    .filter(job => job.status === 'error' || Boolean(job.error))
    .map(job => ({
      kind: 'tool_error' as const,
      level: 'error' as const,
      tool: job.tool_name,
      message: job.error ?? `${job.tool_name} reported an error without a message.`,
      hint:
        `Raised by the TES, not by n8n — the tool's own /internal/tes-callback ` +
        `carried status "error". The n8n node will look green if it runs with ` +
        `continueOnFail; check the ${job.tool_name} container logs.`,
    }));
}

function n8nFailure(run: GatewayRun, alreadyExplained: boolean): ExecutionIssue | null {
  if (run.status !== 'failed') return null;

  if (run.error) {
    // Recorded by /internal/n8n-callback (workflow aborted) or by trigger_run
    // when the production webhook was unreachable. error_node tells them apart
    // without us having to guess from the message text.
    return {
      kind: run.error_node === WEBHOOK_TRIGGER_NODE ? 'trigger_failed' : 'n8n_error',
      level: 'error',
      message: run.error,
      hint: run.error_node
        ? `Raised at "${run.error_node}". Open execution ${run.n8n_execution_id ?? '(none)'} in n8n and inspect that node's input.`
        : `Open execution ${run.n8n_execution_id ?? '(none)'} in n8n.`,
    };
  }

  if (!run.n8n_execution_id) {
    return {
      kind: 'trigger_failed',
      level: 'error',
      message: 'Failed before n8n ever reported an execution id.',
      hint:
        'POST /workflows/{id}/run could not reach the workflow\'s ' +
        'production_webhook_url. Usual causes: the workflow is not activated in ' +
        'n8n, the registered webhook URL is stale, or n8n-main is down.',
    };
  }

  // n8n said "error" and nothing else did. Only worth its own row when no
  // tool already explained the failure, otherwise it just repeats them.
  if (alreadyExplained) return null;

  return {
    kind: 'n8n_error',
    level: 'error',
    message: `n8n reported execution ${run.n8n_execution_id} as failed, without a message.`,
    hint:
      'The workflow\'s Error Workflow posts /internal/n8n-callback with only a ' +
      'status. Add `error` and `error_node` to that request body and the reason ' +
      'will show up here instead of only in the n8n editor.',
  };
}

function lostCallbacks(run: GatewayRun, jobs: ToolExecutionJob[]): ExecutionIssue[] {
  if (run.status !== 'completed_with_warnings') return [];

  const stranded = jobs.filter(job => !isTerminal(job));
  if (stranded.length === 0) {
    // The gateway only reaches this status when a job was non-terminal, so an
    // empty list means the jobs finished after the reconciliation ran.
    return [
      {
        kind: 'lost_callback',
        level: 'warning',
        message: 'n8n finished while at least one tool job was still open.',
        hint:
          'The jobs have since reached a terminal state, so the run status is ' +
          'stale rather than wrong. Re-running reconciliation would clear it.',
      },
    ];
  }

  return stranded.map(job => ({
    kind: 'lost_callback' as const,
    level: 'warning' as const,
    tool: job.tool_name,
    message: `n8n finished, but ${job.tool_name} is still "${job.status}" — its callback never arrived.`,
    hint:
      `No POST /internal/tes-callback for job ${job.id}. The execution looks ` +
      `successful in n8n while its results are missing here — check whether ` +
      `${job.tool_name} crashed, or whether the Wait node resumed early.`,
  }));
}

function inFlightProblems(
  run: GatewayRun,
  jobs: ToolExecutionJob[],
  now: Date,
): ExecutionIssue[] {
  if (run.status !== 'queued' && run.status !== 'running') return [];

  const issues: ExecutionIssue[] = [];
  const runAge = ageMs(run.started_at, now);

  if (!run.n8n_execution_id && runAge !== null && runAge > EXECUTION_ID_GRACE_MS) {
    issues.push({
      kind: 'no_execution_id',
      level: 'warning',
      message: `No n8n execution id after ${formatDuration(run.started_at, undefined, now)}.`,
      hint:
        'The workflow\'s first node should POST /internal/execution-started. ' +
        'Either that node is missing from the workflow, or n8n accepted the ' +
        'webhook and never ran it — check the n8n-worker queue.',
    });
  }

  for (const job of jobs) {
    if (isTerminal(job)) continue;
    const leasedFor = ageMs(job.leased_at, now);
    if (leasedFor === null || leasedFor <= LEASE_GRACE_MS) continue;

    issues.push({
      kind: 'stalled',
      level: 'warning',
      tool: job.tool_name,
      message: `${job.tool_name} has been "${job.status}" for ${formatDuration(job.leased_at, undefined, now)}.`,
      hint:
        'Longer than every timeout in tes_registry (200s by default), so the ' +
        'tool is not merely slow. Likely hung or restarted mid-run, which also ' +
        'means the n8n Wait node will never be resumed.',
    });
  }

  return issues;
}

/** Everything wrong with one execution, worst-first. */
export function diagnoseRun(run: GatewayRun, now: Date = new Date()): ExecutionDebug {
  const jobs = run.tool_execution_jobs ?? [];
  const params = run.params ?? {};

  const issues = toolErrors(jobs);
  const n8n = n8nFailure(run, issues.length > 0);
  if (n8n) issues.unshift(n8n);
  issues.push(...lostCallbacks(run, jobs), ...inFlightProblems(run, jobs, now));

  const level: ExecutionLevel = issues.some(issue => issue.level === 'error')
    ? 'error'
    : issues.length > 0
      ? 'warning'
      : 'ok';

  return {
    runId: run.id,
    executionId: run.n8n_execution_id ?? null,
    workflow: readParam(params, 'workflow') || 'workflow',
    target: readParam(params, 'target') || readParam(params, 'target_name') || readParam(params, 'domain') || '—',
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at ?? undefined,
    jobs,
    params,
    issues,
    level,
  };
}

/** Newest first — debugging always starts from the run that just broke. */
export function diagnoseRuns(runs: GatewayRun[], now: Date = new Date()): ExecutionDebug[] {
  return runs
    .map(run => diagnoseRun(run, now))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export type DebugFilter = 'all' | ExecutionLevel;

export function countByLevel(items: ExecutionDebug[]): Record<DebugFilter, number> {
  return {
    all: items.length,
    error: items.filter(item => item.level === 'error').length,
    warning: items.filter(item => item.level === 'warning').length,
    ok: items.filter(item => item.level === 'ok').length,
  };
}

export function filterByLevel(items: ExecutionDebug[], filter: DebugFilter): ExecutionDebug[] {
  return filter === 'all' ? items : items.filter(item => item.level === filter);
}
