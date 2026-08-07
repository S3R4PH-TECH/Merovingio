import { apiDownload, apiRequest, apiText, writeToken } from './client';
import type {
  AssetItem,
  FindingItem,
  GatewayRun,
  MeResponse,
  ProgramItem,
  RunHosts,
  TargetItem,
  TesEntry,
  WorkflowItem,
  WorkspaceItem,
} from '../types';

// --- auth ---

export async function login(email: string, password: string): Promise<string> {
  const body = await apiRequest<{ access_token: string }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    anonymous: true,
  });
  writeToken(body.access_token);
  return body.access_token;
}

export async function register(
  email: string,
  password: string,
  name: string,
): Promise<string> {
  const body = await apiRequest<{ access_token: string }>('/auth/register', {
    method: 'POST',
    body: { email, password, name },
    anonymous: true,
  });
  // The gateway signs the new account in straight away, so there is no second
  // round trip and no window where a just-created user sees a login form.
  writeToken(body.access_token);
  return body.access_token;
}

export function logout(): void {
  writeToken(null);
}

export function fetchMe(): Promise<MeResponse> {
  return apiRequest<MeResponse>('/me');
}

// --- runs ---

export function fetchRuns(): Promise<GatewayRun[]> {
  return apiRequest<GatewayRun[]>('/runs');
}

export function fetchRun(runId: string): Promise<GatewayRun> {
  return apiRequest<GatewayRun>(`/runs/${runId}`);
}

export function fetchRunHosts(runId: string): Promise<RunHosts> {
  return apiRequest<RunHosts>(`/runs/${runId}/hosts`);
}

export function fetchHostOutput(runId: string, host: string, tool?: string): Promise<string> {
  const query = tool ? `?tool=${encodeURIComponent(tool)}` : '';
  return apiText(`/runs/${runId}/hosts/${encodeURIComponent(host)}/text${query}`);
}

export function downloadRunZip(runId: string): Promise<Blob> {
  return apiDownload(`/runs/${runId}/download-zip`);
}

// --- targets / scope ---

export function fetchTargets(): Promise<TargetItem[]> {
  return apiRequest<TargetItem[]>('/targets');
}

export function createTarget(input: {
  program_id?: string;
  name: string;
  root_domains: string[];
  cidrs: string[];
  out_of_scope: string[];
}): Promise<TargetItem> {
  const { program_id: programId, ...rest } = input;
  // Two paths exist. The program-scoped one enforces RBAC, so it is preferred
  // whenever a program is known; POST /targets is the fallback.
  return programId
    ? apiRequest<TargetItem>(`/programs/${programId}/targets`, { method: 'POST', body: rest })
    : apiRequest<TargetItem>('/targets', { method: 'POST', body: rest });
}

export function updateTarget(
  targetId: string,
  patch: Partial<Pick<TargetItem, 'name' | 'root_domains' | 'cidrs' | 'out_of_scope'>>,
): Promise<TargetItem> {
  return apiRequest<TargetItem>(`/targets/${targetId}`, { method: 'PATCH', body: patch });
}

export function deleteTarget(targetId: string): Promise<void> {
  return apiRequest<void>(`/targets/${targetId}`, { method: 'DELETE' });
}

export function checkScope(
  targetId: string,
  value: string,
): Promise<{ value: string; in_scope: boolean }> {
  return apiRequest(`/targets/${targetId}/scope-check`, { method: 'POST', body: { value } });
}

// --- workflows ---

export function fetchWorkflows(): Promise<WorkflowItem[]> {
  return apiRequest<WorkflowItem[]>('/workflows');
}

export function triggerRun(
  workflowId: string,
  targetId: string,
  params: Record<string, unknown> = {},
): Promise<{ run_id: string; status: string }> {
  return apiRequest(`/workflows/${workflowId}/run`, {
    method: 'POST',
    body: { target_id: targetId, params },
  });
}

// --- tenancy ---

export function fetchWorkspaces(): Promise<WorkspaceItem[]> {
  return apiRequest<WorkspaceItem[]>('/workspaces');
}

export function fetchPrograms(): Promise<ProgramItem[]> {
  return apiRequest<ProgramItem[]>('/programs');
}

// --- results ---

export function fetchFindings(): Promise<FindingItem[]> {
  return apiRequest<FindingItem[]>('/findings');
}

export function fetchAssets(params: { run_id?: string } = {}): Promise<AssetItem[]> {
  const query = params.run_id ? `?run_id=${params.run_id}` : '';
  return apiRequest<AssetItem[]>(`/assets${query}`);
}

// --- TES registry ---

export function fetchTesRegistry(): Promise<TesEntry[]> {
  return apiRequest<TesEntry[]>('/admin/tes');
}
