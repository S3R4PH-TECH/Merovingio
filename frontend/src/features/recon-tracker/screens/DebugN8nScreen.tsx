import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bug,
  CircleCheck,
  Copy,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { ApiError } from '../api/client';
import { fetchRuns } from '../api/gateway';
import { StatusPill } from '../components/StatusPill';
import {
  countByLevel,
  diagnoseRuns,
  filterByLevel,
  ISSUE_LABELS,
  type DebugFilter,
  type ExecutionDebug,
  type ExecutionIssue,
} from '../lib/debug';
import { formatDuration, formatWhen, shortId } from '../lib/format';

/**
 * Short enough that an operator watching a run break sees it break, long
 * enough that /runs — which eager-loads every job and asset of every run — is
 * not being asked to do that four times a minute.
 */
const REFRESH_MS = 15_000;

const FILTERS: { key: DebugFilter; label: string; color: string }[] = [
  { key: 'all', label: 'All executions', color: 'var(--rt-text-dim)' },
  { key: 'error', label: 'Failing', color: 'var(--rt-status-failed)' },
  { key: 'warning', label: 'Degraded', color: 'var(--rt-status-warning)' },
  { key: 'ok', label: 'Clean', color: 'var(--rt-status-success)' },
];

function IssueRow({ issue }: { issue: ExecutionIssue }) {
  const Icon = issue.level === 'error' ? XCircle : TriangleAlert;

  return (
    <li className="rt-dbg-issue" data-level={issue.level}>
      <Icon size={15} className="rt-dbg-issue-icon" aria-hidden="true" />
      <div className="rt-dbg-issue-body">
        <p className="rt-dbg-issue-head">
          <span className="rt-dbg-issue-kind">{ISSUE_LABELS[issue.kind]}</span>
          {issue.tool && <span className="rt-dbg-issue-tool">{issue.tool}</span>}
        </p>
        {/*
          The tool's own words, verbatim and monospaced — a stack trace or a
          shell error mangled into prose is worth nothing to whoever has to
          reproduce it.
        */}
        <pre className="rt-dbg-issue-message">{issue.message}</pre>
        <p className="rt-dbg-issue-hint">{issue.hint}</p>
      </div>
    </li>
  );
}

function ExecutionCard({ execution }: { execution: ExecutionDebug }) {
  const [showJobs, setShowJobs] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyExecutionId = async () => {
    if (!execution.executionId) return;
    try {
      await navigator.clipboard.writeText(execution.executionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access is permission-gated and absent in plain HTTP
      // contexts. The id is still rendered as selectable text.
    }
  };

  const paramsJson = JSON.stringify(execution.params, null, 2);
  const hasParams = paramsJson !== '{}';

  return (
    <article className="rt-dbg-exec" data-level={execution.level}>
      <header className="rt-dbg-exec-head">
        <div className="rt-dbg-exec-ident">
          <h3 className="rt-dbg-exec-title">{execution.workflow}</h3>
          <p className="rt-dbg-exec-sub">
            <span className="rt-cell-mono">run {shortId(execution.runId)}</span>
            <span aria-hidden="true">·</span>
            {/*
              The n8n execution id is the whole reason this screen exists: it
              is the only handle that opens the failing execution in the n8n
              editor, and it is the one field nobody can guess.
            */}
            <span className="rt-dbg-execid">
              n8n exec
              <span className="rt-cell-mono">{execution.executionId ?? 'none'}</span>
              {execution.executionId && (
                <button
                  type="button"
                  className="rt-dbg-copy"
                  onClick={() => void copyExecutionId()}
                  aria-label={`Copy n8n execution id ${execution.executionId}`}
                >
                  <Copy size={12} aria-hidden="true" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span>{execution.target}</span>
          </p>
        </div>

        <div className="rt-dbg-exec-meta">
          <StatusPill status={execution.status} />
          <span className="rt-dbg-exec-time">
            {formatWhen(execution.startedAt)} · {formatDuration(execution.startedAt, execution.finishedAt)}
          </span>
        </div>
      </header>

      {execution.issues.length > 0 ? (
        <ul className="rt-dbg-issues">
          {execution.issues.map((issue, index) => (
            <IssueRow key={`${issue.kind}-${issue.tool ?? index}-${index}`} issue={issue} />
          ))}
        </ul>
      ) : (
        <p className="rt-dbg-clean">
          <CircleCheck size={15} aria-hidden="true" />
          No errors recorded for this execution.
        </p>
      )}

      {execution.jobs.length > 0 && (
        <>
          <button
            type="button"
            className="rt-btn-ghost rt-btn-sm rt-dbg-toggle"
            aria-expanded={showJobs}
            onClick={() => setShowJobs(open => !open)}
          >
            {showJobs ? 'Hide' : 'Show'} tool jobs ({execution.jobs.length})
          </button>

          {showJobs && (
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
                  {execution.jobs.map(job => (
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
        </>
      )}

      {showJobs && hasParams && (
        <pre className="rt-output rt-dbg-params">{paramsJson}</pre>
      )}
    </article>
  );
}

export function DebugN8nScreen() {
  const [executions, setExecutions] = useState<ExecutionDebug[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DebugFilter>('all');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const runs = await fetchRuns();
      setExecutions(diagnoseRuns(runs));
      setError(null);
      setUpdatedAt(new Date());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to load executions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    // A debug screen that shows a stale picture is worse than none: the
    // failure an operator is chasing is usually happening right now.
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => countByLevel(executions), [executions]);
  const visible = useMemo(() => filterByLevel(executions, filter), [executions, filter]);
  const issueCount = useMemo(
    () => executions.reduce((total, item) => total + item.issues.length, 0),
    [executions],
  );

  return (
    <>
      <div className="rt-welcome">
        <h1>Debug n8n</h1>
        <p>Every execution the gateway recorded, and what went wrong inside it</p>
      </div>

      {error && (
        <p className="rt-error" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      )}

      <section className="rt-dbg-facets" aria-label="Filter executions by health">
        {FILTERS.map(({ key, label, color }) => (
          <button
            key={key}
            type="button"
            className="rt-card rt-dbg-facet"
            data-active={filter === key}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            <span className="rt-dbg-facet-dot" style={{ background: color }} aria-hidden="true" />
            <span className="rt-dbg-facet-label">{label}</span>
            <span className="rt-dbg-facet-value">{counts[key]}</span>
          </button>
        ))}
      </section>

      <section className="rt-card rt-panel" aria-labelledby="rt-debug-list">
        <div className="rt-card-header">
          <div>
            <h2 className="rt-card-title" id="rt-debug-list">
              {filter === 'all' ? 'All executions' : FILTERS.find(f => f.key === filter)?.label}
            </h2>
            <p className="rt-card-subtitle">
              {visible.length} shown · {issueCount} issue{issueCount === 1 ? '' : 's'} across all
              executions
              {updatedAt && ` · updated ${updatedAt.toLocaleTimeString()}`}
            </p>
          </div>
          <button type="button" className="rt-btn-ghost rt-btn-sm" onClick={() => void load()}>
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="rt-placeholder">Loading executions…</p>
        ) : visible.length === 0 ? (
          <p className="rt-placeholder">
            <Bug size={18} aria-hidden="true" />
            <br />
            {executions.length === 0
              ? 'No executions recorded yet. Dispatch a workflow and its errors will appear here.'
              : 'No executions match this filter.'}
          </p>
        ) : (
          <div className="rt-dbg-list">
            {visible.map(execution => (
              <ExecutionCard key={execution.runId} execution={execution} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
