import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, TriangleAlert } from 'lucide-react';
import { ApiError } from '../api/client';
import { fetchFindings } from '../api/gateway';
import { formatWhen, shortId } from '../lib/format';
import { SEVERITY_COLORS, SEVERITY_ORDER, type FindingItem } from '../types';

export function FindingsScreen() {
  const [findings, setFindings] = useState<FindingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string>('all');

  useEffect(() => {
    let active = true;

    fetchFindings()
      .then(data => {
        if (active) setFindings(data);
      })
      .catch(caught => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : 'Failed to load findings');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const tally = new Map<string, number>(SEVERITY_ORDER.map(s => [s, 0]));
    for (const finding of findings) {
      tally.set(finding.severity, (tally.get(finding.severity) ?? 0) + 1);
    }
    return tally;
  }, [findings]);

  const visible = useMemo(
    () => (severity === 'all' ? findings : findings.filter(f => f.severity === severity)),
    [findings, severity],
  );

  return (
    <>
      <div className="rt-welcome">
        <h1>Findings</h1>
        <p>Weaknesses confirmed against in-scope hosts</p>
      </div>

      {error && (
        <p className="rt-error" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      )}

      <section className="rt-sev-grid" aria-label="Findings by severity">
        {SEVERITY_ORDER.map(level => (
          <button
            key={level}
            type="button"
            className="rt-card rt-sev-card"
            data-active={severity === level}
            onClick={() => setSeverity(severity === level ? 'all' : level)}
          >
            <span className="rt-sev-dot" style={{ background: SEVERITY_COLORS[level] }} />
            <span className="rt-sev-label">{level}</span>
            <span className="rt-sev-value">{counts.get(level) ?? 0}</span>
          </button>
        ))}
      </section>

      <section className="rt-card rt-panel" aria-labelledby="rt-findings-list">
        <div className="rt-card-header">
          <div>
            <h2 className="rt-card-title" id="rt-findings-list">
              {severity === 'all' ? 'All findings' : `${severity} findings`}
            </h2>
            <p className="rt-card-subtitle">{visible.length} shown</p>
          </div>
        </div>

        {loading ? (
          <p className="rt-placeholder">Loading findings…</p>
        ) : visible.length === 0 ? (
          <p className="rt-placeholder">
            <ShieldAlert size={18} aria-hidden="true" />
            <br />
            No findings recorded. They are written by a TES through
            /internal/tes-callback during a run.
          </p>
        ) : (
          <div className="rt-table-wrap">
            <table className="rt-table">
              <thead>
                <tr>
                  <th scope="col">Severity</th>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Run</th>
                  <th scope="col">Found</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(finding => (
                  <tr key={finding.id}>
                    <td>
                      <span className="rt-pill" data-severity={finding.severity}>
                        <span
                          className="rt-pill-dot"
                          style={{ background: SEVERITY_COLORS[finding.severity] }}
                          aria-hidden="true"
                        />
                        {finding.severity}
                      </span>
                    </td>
                    <td className="rt-cell-strong">{finding.title}</td>
                    <td>{finding.status}</td>
                    <td className="rt-cell-mono">{shortId(finding.run_id)}</td>
                    <td>{formatWhen(finding.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
