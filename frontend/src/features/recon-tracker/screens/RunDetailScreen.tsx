import { useEffect, useState } from 'react';
import { ArrowLeft, Download, FileText, Server, TriangleAlert } from 'lucide-react';
import { ApiError } from '../api/client';
import { downloadRunZip, fetchHostOutput, fetchRun, fetchRunHosts } from '../api/gateway';
import { StatusPill } from '../components/StatusPill';
import { formatDuration, formatWhen, shortId } from '../lib/format';
import type { GatewayRun, RunHosts } from '../types';

interface RunDetailScreenProps {
  runId: string;
  onBack: () => void;
}

export function RunDetailScreen({ runId, onBack }: RunDetailScreenProps) {
  const [run, setRun] = useState<GatewayRun | null>(null);
  const [hosts, setHosts] = useState<RunHosts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [openHost, setOpenHost] = useState<string | null>(null);
  const [outputText, setOutputText] = useState<string>('');
  const [outputLoading, setOutputLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([fetchRun(runId), fetchRunHosts(runId).catch(() => null)])
      .then(([runData, hostData]) => {
        if (!active) return;
        setRun(runData);
        setHosts(hostData);
        setError(null);
      })
      .catch(caught => {
        if (!active) return;
        setError(caught instanceof ApiError ? caught.message : 'Failed to load run');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [runId]);

  const openOutput = async (host: string) => {
    setOpenHost(host);
    setOutputLoading(true);
    try {
      setOutputText(await fetchHostOutput(runId, host));
    } catch (caught) {
      setOutputText(
        caught instanceof ApiError ? `Could not load output: ${caught.message}` : 'Failed',
      );
    } finally {
      setOutputLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await downloadRunZip(runId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `run_${runId}_outputs.zip`;
      anchor.click();
      // Revoking immediately would race the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Download failed');
    }
  };

  return (
    <>
      <button type="button" className="rt-btn-ghost rt-back" onClick={onBack}>
        <ArrowLeft size={15} aria-hidden="true" />
        Back to runs
      </button>

      <div className="rt-welcome">
        <h1>Run {shortId(runId)}</h1>
        <p>Execution detail, discovered hosts and raw tool output</p>
      </div>

      {error && (
        <p className="rt-error" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      )}

      {loading ? (
        <p className="rt-placeholder">Loading run…</p>
      ) : run ? (
        <>
          <section className="rt-card rt-panel" aria-labelledby="rt-run-summary">
            <div className="rt-card-header">
              <div>
                <h2 className="rt-card-title" id="rt-run-summary">
                  Summary
                </h2>
                <p className="rt-card-subtitle">
                  Started {formatWhen(run.started_at)} · ran for{' '}
                  {formatDuration(run.started_at, run.finished_at ?? undefined)}
                </p>
              </div>
              <button type="button" className="rt-btn-ghost" onClick={() => void handleDownload()}>
                <Download size={15} aria-hidden="true" />
                Download ZIP
              </button>
            </div>

            <dl className="rt-defs">
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusPill status={run.status} />
                </dd>
              </div>
              <div>
                <dt>Assets discovered</dt>
                <dd className="rt-cell-strong">{(run.assets ?? []).length}</dd>
              </div>
              <div>
                <dt>n8n execution</dt>
                <dd className="rt-cell-mono">{run.n8n_execution_id ?? '—'}</dd>
              </div>
              <div>
                <dt>Target id</dt>
                <dd className="rt-cell-mono">{shortId(run.target_id)}</dd>
              </div>
            </dl>
          </section>

          <section className="rt-card rt-panel" aria-labelledby="rt-run-jobs">
            <div className="rt-card-header">
              <div>
                <h2 className="rt-card-title" id="rt-run-jobs">
                  Tool executions
                </h2>
                <p className="rt-card-subtitle">
                  Every TES call this run made, in order
                </p>
              </div>
            </div>

            {(run.tool_execution_jobs ?? []).length === 0 ? (
              <p className="rt-placeholder">No tool jobs recorded for this run.</p>
            ) : (
              <div className="rt-table-wrap">
                <table className="rt-table">
                  <thead>
                    <tr>
                      <th scope="col">Tool</th>
                      <th scope="col">Status</th>
                      <th scope="col">Leased</th>
                      <th scope="col">Duration</th>
                      <th scope="col">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(run.tool_execution_jobs ?? []).map(job => (
                      <tr key={job.id}>
                        <td className="rt-cell-strong">{job.tool_name}</td>
                        <td>
                          <StatusPill status={job.status} />
                        </td>
                        <td>{formatWhen(job.leased_at)}</td>
                        <td>{formatDuration(job.leased_at, job.finished_at ?? undefined)}</td>
                        <td className="rt-cell-danger">{job.error ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rt-card rt-panel" aria-labelledby="rt-run-hosts">
            <div className="rt-card-header">
              <div>
                <h2 className="rt-card-title" id="rt-run-hosts">
                  Hosts discovered
                </h2>
                <p className="rt-card-subtitle">{hosts?.total_hosts ?? 0} hosts</p>
              </div>
            </div>

            {!hosts || hosts.hosts.length === 0 ? (
              <p className="rt-placeholder">
                <Server size={18} aria-hidden="true" />
                <br />
                No hosts recorded for this run.
              </p>
            ) : (
              <div className="rt-table-wrap">
                <table className="rt-table">
                  <thead>
                    <tr>
                      <th scope="col">Host</th>
                      <th scope="col" className="rt-num">
                        Assets
                      </th>
                      <th scope="col">Tools</th>
                      <th scope="col">
                        <span className="rt-visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {hosts.hosts.map(host => (
                      <tr key={host.host}>
                        <td className="rt-cell-mono rt-cell-strong">{host.host}</td>
                        <td className="rt-num">{host.asset_count}</td>
                        <td>{host.tools.join(', ') || '—'}</td>
                        <td className="rt-cell-actions">
                          <button
                            type="button"
                            className="rt-btn-ghost rt-btn-sm"
                            onClick={() => void openOutput(host.host)}
                          >
                            <FileText size={14} aria-hidden="true" />
                            Output
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {openHost && (
            <section className="rt-card rt-panel" aria-labelledby="rt-run-output">
              <div className="rt-card-header">
                <div>
                  <h2 className="rt-card-title" id="rt-run-output">
                    Raw output — {openHost}
                  </h2>
                  <p className="rt-card-subtitle">Exactly what the tool wrote</p>
                </div>
                <button
                  type="button"
                  className="rt-btn-ghost rt-btn-sm"
                  onClick={() => setOpenHost(null)}
                >
                  Close
                </button>
              </div>
              <pre className="rt-output">
                {outputLoading ? 'Loading…' : outputText || '(empty)'}
              </pre>
            </section>
          )}
        </>
      ) : null}
    </>
  );
}
