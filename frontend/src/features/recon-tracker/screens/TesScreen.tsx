import { useEffect, useState } from 'react';
import { Server, TriangleAlert } from 'lucide-react';
import { ApiError } from '../api/client';
import { fetchTesRegistry } from '../api/gateway';
import type { TesEntry } from '../types';

export function TesScreen() {
  const [entries, setEntries] = useState<TesEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchTesRegistry()
      .then(data => {
        if (active) setEntries(data);
      })
      .catch(caught => {
        if (!active) return;
        setError(
          caught instanceof ApiError && caught.isForbidden
            ? 'The TES registry is restricted to platform admins — your account is not one.'
            : caught instanceof ApiError
              ? caught.message
              : 'Failed to load the TES registry',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <div className="rt-welcome">
        <h1>TES Registry</h1>
        <p>Tool Execution Services — the only components allowed to run offensive tools</p>
      </div>

      {error && (
        <p className="rt-error" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      )}

      <section className="rt-card rt-panel" aria-labelledby="rt-tes-list">
        <div className="rt-card-header">
          <div>
            <h2 className="rt-card-title" id="rt-tes-list">
              Registered services
            </h2>
            <p className="rt-card-subtitle">{entries.length} registered</p>
          </div>
        </div>

        {loading ? (
          <p className="rt-placeholder">Loading registry…</p>
        ) : entries.length === 0 ? (
          <p className="rt-placeholder">
            <Server size={18} aria-hidden="true" />
            <br />
            No TES registered. Seed one with <code>scripts/seed_tes.py</code>.
          </p>
        ) : (
          <div className="rt-table-wrap">
            <table className="rt-table">
              <thead>
                <tr>
                  <th scope="col">Tool</th>
                  <th scope="col">Base URL</th>
                  <th scope="col">Health</th>
                  <th scope="col" className="rt-num">
                    Concurrency
                  </th>
                  <th scope="col" className="rt-num">
                    Timeout
                  </th>
                  <th scope="col">Token</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id}>
                    <td className="rt-cell-strong">{entry.tool_name}</td>
                    <td className="rt-cell-mono">{entry.base_url}</td>
                    <td>
                      <span className="rt-pill" data-health={entry.health_status}>
                        <span className="rt-pill-dot" aria-hidden="true" />
                        {entry.health_status}
                      </span>
                    </td>
                    <td className="rt-num">{entry.max_concurrency}</td>
                    <td className="rt-num">{entry.timeout_seconds}s</td>
                    {/* The registry never echoes the secret back — only whether
                        one is configured. Showing "configured" is the most the
                        API will tell us, and that is by design. */}
                    <td>{entry.has_static_token ? 'configured' : '—'}</td>
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
