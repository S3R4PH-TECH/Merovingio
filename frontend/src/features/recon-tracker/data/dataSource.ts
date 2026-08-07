import { TOOLS, type RunRecord, type RunStatus, type ToolName } from '../types';

const KNOWN_STATUSES: readonly RunStatus[] = [
  'queued',
  'running',
  'success',
  'completed_with_warnings',
  'failed',
];

/** Shape of backend-gateway's RunResponse, narrowed to what the dashboard reads. */
interface GatewayRun {
  id: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  params?: Record<string, unknown> | null;
  tool_execution_jobs?: { tool_name: string }[] | null;
  assets?: unknown[] | null;
}

function coerceStatus(status: string): RunStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(status)
    ? (status as RunStatus)
    : 'queued';
}

function coerceTool(name: string | undefined): ToolName {
  return (TOOLS as readonly string[]).includes(name ?? '')
    ? (name as ToolName)
    : 'theharvester';
}

function readParam(params: Record<string, unknown> | null | undefined, key: string): string {
  const value = params?.[key];
  return typeof value === 'string' && value !== '' ? value : '';
}

/** Maps one gateway RunResponse onto the shape the dashboard renders. */
export function mapGatewayRun(run: GatewayRun): RunRecord {
  const jobs = run.tool_execution_jobs ?? [];

  return {
    id: run.id,
    workflow: readParam(run.params, 'workflow') || 'workflow',
    target: readParam(run.params, 'target') || readParam(run.params, 'domain') || 'unknown',
    tool: coerceTool(jobs[0]?.tool_name),
    status: coerceStatus(run.status),
    startedAt: run.started_at,
    finishedAt: run.finished_at ?? undefined,
    assetCount: (run.assets ?? []).length,
    program: readParam(run.params, 'program') || 'Internal',
  };
}
