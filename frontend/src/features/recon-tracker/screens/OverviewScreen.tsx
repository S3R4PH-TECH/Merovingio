import { Activity, CheckCircle2, Crosshair, GitBranch, Play, Radar, XCircle } from 'lucide-react';
import { FilterBar } from '../components/FilterBar';
import { KpiCard } from '../components/KpiCard';
import { RunVolumeChart } from '../components/RunVolumeChart';
import { StatusDonutChart } from '../components/StatusDonutChart';
import { RunsByToolChart } from '../components/RunsByToolChart';
import { StatusPill } from '../components/StatusPill';
import { formatDuration, formatWhen } from '../lib/format';
import type {
  DashboardFilters,
  KpiSet,
  RunRecord,
  StatusSlice,
  ToolBar,
  VolumePoint,
  WorkflowItem,
} from '../types';

interface OverviewScreenProps {
  userName: string;
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  onNewRun: () => void;
  kpis: KpiSet;
  volume: VolumePoint[];
  statuses: StatusSlice[];
  tools: ToolBar[];
  trend: number;
  periodLabel: string;
  loading: boolean;
  isEmpty: boolean;
  workflows: WorkflowItem[];
  recentRuns: RunRecord[];
  onOpenRun: (runId: string) => void;
  onRunWorkflow: (workflowId: string) => void;
}

export function OverviewScreen({
  userName,
  filters,
  onFiltersChange,
  onNewRun,
  kpis,
  volume,
  statuses,
  tools,
  trend,
  periodLabel,
  loading,
  isEmpty,
  workflows,
  recentRuns,
  onOpenRun,
  onRunWorkflow,
}: OverviewScreenProps) {
  return (
    <>
      <div className="rt-welcome">
        <h1>Welcome back, {userName}</h1>
        <p>Track and manage your recon workflow activity</p>
      </div>

      <FilterBar filters={filters} onFiltersChange={onFiltersChange} onNewRun={onNewRun} />

      <section className="rt-kpi-grid" aria-label="Key metrics">
        <KpiCard
          label="Total Runs"
          value={kpis.total}
          caption={periodLabel}
          icon={Activity}
          loading={loading}
        />
        <KpiCard
          label="Active Runs"
          value={kpis.active}
          caption={kpis.active > 0 ? 'In progress' : periodLabel}
          captionTone={kpis.active > 0 ? 'warning' : 'neutral'}
          icon={Radar}
          variant={kpis.active > 0 ? 'warning' : 'neutral'}
          loading={loading}
        />
        <KpiCard
          label="Succeeded"
          value={kpis.succeeded}
          caption={periodLabel}
          captionTone="positive"
          icon={CheckCircle2}
          variant="positive"
          loading={loading}
        />
        <KpiCard
          label="Failed"
          value={kpis.failed}
          caption={periodLabel}
          icon={XCircle}
          variant="negative"
          loading={loading}
        />
      </section>

      <section className="rt-assets-strip" aria-label="Discovery">
        <span className="rt-assets-icon" aria-hidden="true">
          <Crosshair size={17} />
        </span>
        <div>
          <p className="rt-assets-label">Assets discovered</p>
          <p className="rt-assets-sub">
            Subdomains, hosts and endpoints persisted from these runs
          </p>
        </div>
        <span className="rt-assets-value" data-testid="assets-value" aria-live="polite">
          {kpis.assets}
        </span>
      </section>

      {/* Workflows first: an operator opens this page to launch something, and
          the launcher should not be below the fold behind three charts. */}
      <section className="rt-card rt-panel" aria-labelledby="rt-workflows">
        <div className="rt-card-header">
          <div>
            <h2 className="rt-card-title" id="rt-workflows">
              Workflows
            </h2>
            <p className="rt-card-subtitle">Registered definitions, ready to dispatch</p>
          </div>
        </div>

        {workflows.length === 0 ? (
          <p className="rt-placeholder">
            <GitBranch size={18} aria-hidden="true" />
            <br />
            No workflows registered yet. They live in <code>workflows/*.json</code> and are
            registered through POST /workspaces/&#123;id&#125;/workflows.
          </p>
        ) : (
          <ul className="rt-workflow-list">
            {workflows.map(workflow => (
              <li className="rt-workflow-item" key={workflow.id}>
                <span className="rt-workflow-icon" aria-hidden="true">
                  <GitBranch size={16} />
                </span>
                <span className="rt-workflow-body">
                  <span className="rt-workflow-name">{workflow.name}</span>
                  <span className="rt-workflow-path">{workflow.git_path}</span>
                </span>
                <span className="rt-workflow-version">v{workflow.current_version}</span>
                <button
                  type="button"
                  className="rt-btn-ghost rt-btn-sm"
                  onClick={() => onRunWorkflow(workflow.id)}
                >
                  <Play size={14} aria-hidden="true" />
                  Run
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Runs that already happened or are happening right now. */}
      <section className="rt-card rt-panel" aria-labelledby="rt-recent-runs">
        <div className="rt-card-header">
          <div>
            <h2 className="rt-card-title" id="rt-recent-runs">
              Recent &amp; active runs
            </h2>
            <p className="rt-card-subtitle">{recentRuns.length} most recent executions</p>
          </div>
        </div>

        {recentRuns.length === 0 ? (
          <p className="rt-placeholder">No runs in this period.</p>
        ) : (
          <div className="rt-table-wrap">
            <table className="rt-table">
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Workflow</th>
                  <th scope="col">Target</th>
                  <th scope="col">Started</th>
                  <th scope="col">Duration</th>
                  <th scope="col" className="rt-num">
                    Assets
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map(run => (
                  <tr
                    key={run.id}
                    className="rt-row-clickable"
                    tabIndex={0}
                    role="button"
                    aria-label={`Open run ${run.workflow} on ${run.target}`}
                    onClick={() => onOpenRun(run.id)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onOpenRun(run.id);
                      }
                    }}
                  >
                    <td>
                      <StatusPill status={run.status} />
                    </td>
                    <td className="rt-cell-strong">{run.workflow}</td>
                    <td className="rt-cell-mono">{run.target}</td>
                    <td>{formatWhen(run.startedAt)}</td>
                    <td>{formatDuration(run.startedAt, run.finishedAt)}</td>
                    <td className="rt-num rt-cell-strong">{run.assetCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RunVolumeChart
        data={volume}
        periodLabel={periodLabel}
        trendPercent={trend}
        isEmpty={isEmpty}
      />

      <div className="rt-chart-grid-2">
        <StatusDonutChart data={statuses} />
        <RunsByToolChart data={tools} />
      </div>
    </>
  );
}
