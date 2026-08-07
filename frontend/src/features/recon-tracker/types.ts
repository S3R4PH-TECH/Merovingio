/**
 * Domain of the Merovíngio platform: a run is one execution of a workflow
 * against a target, carried out by a Tool Execution Service (TES).
 * Mirrors backend-gateway/app/schema.py RunResponse.
 */

/** The five states a Run moves through in the gateway. */
export type RunStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'completed_with_warnings'
  | 'failed';

/** TES tools registered in the platform (docker-compose services). */
export type ToolName =
  | 'theharvester'
  | 'pd-recon'
  | 'pd-scan'
  | 'pd-crawler'
  | 'fuzz-svc'
  | 'net-scan';

export type PeriodKey = '24h' | '7d' | '30d';

export type ThemeMode = 'dark' | 'light';

export type RouteKey = 'overview' | 'runs' | 'active' | 'scope' | 'tes' | 'findings';

export interface RunRecord {
  id: string;
  /** Workflow name, or the target when the workflow is unnamed. */
  workflow: string;
  target: string;
  tool: ToolName;
  status: RunStatus;
  /** ISO 8601 — matches the gateway's started_at. */
  startedAt: string;
  finishedAt?: string;
  /** Assets discovered by this run — the metric recon actually cares about. */
  assetCount: number;
  program: string;
}

export interface NewRunInput {
  target: string;
  tool: ToolName;
  notes: string;
}

export interface DashboardFilters {
  period: PeriodKey;
  tool: ToolName | 'all';
  status: RunStatus | 'all';
  program: string | 'all';
}

export interface KpiSet {
  total: number;
  /** queued + running — everything still in flight. */
  active: number;
  succeeded: number;
  failed: number;
  /** Assets discovered across the filtered runs. */
  assets: number;
}

export interface VolumePoint {
  date: string;
  label: string;
  count: number;
}

export interface StatusSlice {
  status: RunStatus;
  label: string;
  value: number;
  color: string;
}

export interface ToolBar {
  tool: ToolName;
  value: number;
}

export interface RunDataSource {
  /** True when the gateway had nothing to show and sample data stood in. */
  readonly isDemo: boolean;
  listRuns(): Promise<RunRecord[]>;
  createRun(input: NewRunInput): Promise<RunRecord>;
}

export const TOOLS: readonly ToolName[] = [
  'theharvester',
  'pd-recon',
  'pd-scan',
  'pd-crawler',
  'fuzz-svc',
  'net-scan',
];

/** Display names — the wire uses the service id, operators read the tool. */
export const TOOL_LABELS: Record<ToolName, string> = {
  theharvester: 'theHarvester',
  'pd-recon': 'Subfinder (pd-recon)',
  'pd-scan': 'Nuclei (pd-scan)',
  'pd-crawler': 'Katana (pd-crawler)',
  'fuzz-svc': 'ffuf (fuzz-svc)',
  'net-scan': 'Nmap (net-scan)',
};

export const STATUS_ORDER: readonly RunStatus[] = [
  'success',
  'running',
  'queued',
  'completed_with_warnings',
  'failed',
];

export const STATUS_LABELS: Record<RunStatus, string> = {
  success: 'Success',
  running: 'Running',
  queued: 'Queued',
  completed_with_warnings: 'Warnings',
  failed: 'Failed',
};

export const STATUS_COLORS: Record<RunStatus, string> = {
  success: 'var(--rt-status-success)',
  running: 'var(--rt-status-running)',
  queued: 'var(--rt-status-queued)',
  completed_with_warnings: 'var(--rt-status-warning)',
  failed: 'var(--rt-status-failed)',
};

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

export const PROGRAMS: readonly string[] = ['All Programs', 'HackerOne', 'Internal', 'Bug Bounty'];

export const ROLES: readonly string[] = ['Admin', 'Operator', 'Viewer'];

// --- Wire shapes from backend-gateway (app/schema.py) ---

export interface MeResponse {
  id: string;
  email: string;
  name: string;
}

export interface GatewayRun {
  id: string;
  workflow_definition_id: string;
  target_id: string;
  program_id: string;
  n8n_execution_id?: string | null;
  status: string;
  started_at: string;
  finished_at?: string | null;
  params?: Record<string, unknown> | null;
  tool_execution_jobs?: ToolExecutionJob[] | null;
  assets?: { id: string; type: string; value: string; source_tool: string }[] | null;
}

export interface ToolExecutionJob {
  id: string;
  tool_name: string;
  status: string;
  leased_at: string;
  finished_at?: string | null;
  error?: string | null;
}

export interface RunHosts {
  run_id: string;
  total_hosts: number;
  hosts: { host: string; asset_count: number; tools: string[] }[];
}

export interface TargetItem {
  id: string;
  program_id: string;
  name: string;
  root_domains: string[];
  cidrs: string[];
  out_of_scope: string[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowItem {
  id: string;
  workspace_id: string;
  name: string;
  git_path: string;
  current_version: string;
  production_webhook_url?: string | null;
  created_at: string;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface ProgramItem {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  created_at: string;
}

export interface FindingItem {
  id: string;
  program_id: string;
  target_id: string;
  run_id: string;
  asset_id?: string | null;
  severity: string;
  title: string;
  description?: string | null;
  status: string;
  cve_refs: string[];
  created_at: string;
}

export interface AssetItem {
  id: string;
  program_id: string;
  target_id: string;
  run_id: string;
  type: string;
  value: string;
  source_tool: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface TesEntry {
  id: string;
  tool_name: string;
  base_url: string;
  health_status: string;
  max_concurrency: number;
  timeout_seconds: number;
  has_static_token?: boolean;
}

export const SEVERITY_ORDER: readonly string[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
];

export const SEVERITY_COLORS: Record<string, string> = {
  critical: 'var(--rt-status-failed)',
  high: 'var(--rt-status-failed)',
  medium: 'var(--rt-status-warning)',
  low: 'var(--rt-status-running)',
  info: 'var(--rt-status-queued)',
};
