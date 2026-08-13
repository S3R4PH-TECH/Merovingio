import type { ReactNode } from 'react';
import { Play, TriangleAlert } from 'lucide-react';
import { StatusPill } from '../components/StatusPill';
import { formatDuration, formatWhen } from '../lib/format';
import type { RunRecord } from '../types';

interface RunsScreenProps {
  title: string;
  subtitle: string;
  runs: RunRecord[];
  loading: boolean;
  error: string | null;
  onOpenRun: (runId: string) => void;
  onNewRun: () => void;
  /**
   * Rendered beside the executions table. Opt-in because this component backs
   * both All Runs and Active Runs, and only the former is a place to be
   * editing scope — Active Runs is something you watch, not something you
   * configure.
   */
  aside?: ReactNode;
}

export function RunsScreen({
  title,
  subtitle,
  runs,
  loading,
  error,
  onOpenRun,
  onNewRun,
  aside,
}: RunsScreenProps) {
  return (
    <>
      <div className="rt-welcome">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      {error && (
        <p className="rt-error" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      )}

      {/*
        Without an aside this collapses to a single column, so the page reads
        exactly as it did before rather than as a two-column grid with one
        empty side.
      */}
      <div className="rt-runs-split" data-split={aside !== undefined}>
        <section className="rt-card rt-panel" aria-labelledby="rt-runs-list">
          <div className="rt-card-header">
            <div>
              <h2 className="rt-card-title" id="rt-runs-list">
                Executions
              </h2>
              <p className="rt-card-subtitle">{runs.length} shown</p>
            </div>
            <button type="button" className="rt-btn-primary" onClick={onNewRun}>
              <Play size={15} aria-hidden="true" />
              New Run
            </button>
          </div>

          {loading ? (
            <p className="rt-placeholder">Loading runs…</p>
          ) : runs.length === 0 ? (
            <p className="rt-placeholder">
              No runs yet. Dispatch a workflow to see executions here.
            </p>
          ) : (
            <div className="rt-table-wrap">
              <table className="rt-table">
                <thead>
                  <tr>
                    <th scope="col">Status</th>
                    <th scope="col">Workflow</th>
                    <th scope="col">Target</th>
                    <th scope="col">Tool</th>
                    <th scope="col">Started</th>
                    <th scope="col">Duration</th>
                    <th scope="col" className="rt-num">
                      Assets
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => (
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
                      <td>{run.tool}</td>
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

        {aside}
      </div>
    </>
  );
}
