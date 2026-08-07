import { useEffect, useMemo, useState } from 'react';
import { Crosshair, Plus, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { checkScope, createTarget, deleteTarget, fetchTargets } from '../api/gateway';
import { ApiError } from '../api/client';
import { parseScopeList } from '../lib/scope';
import type { TargetItem } from '../types';

export function ScopeScreen() {
  const [targets, setTargets] = useState<TargetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [domainsRaw, setDomainsRaw] = useState('');
  const [cidrsRaw, setCidrsRaw] = useState('');
  const [outRaw, setOutRaw] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [probeTarget, setProbeTarget] = useState('');
  const [probeValue, setProbeValue] = useState('');
  const [probeResult, setProbeResult] = useState<{ value: string; in_scope: boolean } | null>(
    null,
  );

  const domains = useMemo(() => parseScopeList(domainsRaw), [domainsRaw]);
  const cidrs = useMemo(() => parseScopeList(cidrsRaw), [cidrsRaw]);
  const outOfScope = useMemo(() => parseScopeList(outRaw), [outRaw]);

  const load = async () => {
    setLoading(true);
    try {
      setTargets(await fetchTargets());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to load targets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (name.trim() === '') {
      setFormError('Target name is required');
      return;
    }
    if (domains.valid.length === 0 && cidrs.valid.length === 0) {
      // A target with no scope authorises nothing, and an offensive tool
      // pointed at an empty scope is the one case worth blocking outright.
      setFormError('Add at least one root domain or CIDR — a target with no scope runs nothing');
      return;
    }
    if (domains.invalid.length > 0 || cidrs.invalid.length > 0) {
      setFormError(
        `Invalid entries: ${[...domains.invalid, ...cidrs.invalid].join(', ')}`,
      );
      return;
    }

    setSaving(true);
    try {
      await createTarget({
        name: name.trim(),
        root_domains: domains.valid,
        cidrs: cidrs.valid,
        out_of_scope: outOfScope.valid,
      });
      setName('');
      setDomainsRaw('');
      setCidrsRaw('');
      setOutRaw('');
      await load();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Failed to create target');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (target: TargetItem) => {
    try {
      await deleteTarget(target.id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to delete target');
    }
  };

  const handleProbe = async (event: React.FormEvent) => {
    event.preventDefault();
    if (probeTarget === '' || probeValue.trim() === '') return;
    try {
      setProbeResult(await checkScope(probeTarget, probeValue.trim()));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Scope check failed');
    }
  };

  return (
    <>
      <div className="rt-welcome">
        <h1>Scope &amp; Targets</h1>
        <p>What the platform is authorised to touch</p>
      </div>

      {error && (
        <p className="rt-error" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      )}

      <section className="rt-card rt-panel" aria-labelledby="rt-new-target">
        <div className="rt-card-header">
          <div>
            <h2 className="rt-card-title" id="rt-new-target">
              Add new target
            </h2>
            <p className="rt-card-subtitle">
              One entry per line, or comma separated. Out-of-scope always wins over in-scope.
            </p>
          </div>
        </div>

        <form className="rt-form-grid" onSubmit={handleCreate}>
          <div className="rt-field">
            <label htmlFor="rt-t-name">Target name</label>
            <input
              id="rt-t-name"
              className="rt-input"
              placeholder="Acme production"
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </div>

          <div className="rt-field">
            <label htmlFor="rt-t-domains">
              Root domains <span className="rt-count">{domains.valid.length}</span>
            </label>
            <textarea
              id="rt-t-domains"
              className="rt-textarea"
              placeholder={'example.org\napi.example.org'}
              value={domainsRaw}
              onChange={event => setDomainsRaw(event.target.value)}
            />
            {domains.invalid.length > 0 && (
              <p className="rt-field-warn">Not a domain: {domains.invalid.join(', ')}</p>
            )}
          </div>

          <div className="rt-field">
            <label htmlFor="rt-t-cidrs">
              CIDRs <span className="rt-count">{cidrs.valid.length}</span>
            </label>
            <textarea
              id="rt-t-cidrs"
              className="rt-textarea"
              placeholder={'10.0.0.0/24\n192.168.1.0/24'}
              value={cidrsRaw}
              onChange={event => setCidrsRaw(event.target.value)}
            />
            {cidrs.invalid.length > 0 && (
              <p className="rt-field-warn">Not a CIDR: {cidrs.invalid.join(', ')}</p>
            )}
          </div>

          <div className="rt-field">
            <label htmlFor="rt-t-out">
              Out of scope <span className="rt-count">{outOfScope.valid.length}</span>
            </label>
            <textarea
              id="rt-t-out"
              className="rt-textarea"
              placeholder={'admin.example.org\n10.0.0.5'}
              value={outRaw}
              onChange={event => setOutRaw(event.target.value)}
            />
          </div>

          <div className="rt-form-actions">
            {formError && (
              <p className="rt-field-error" role="alert">
                {formError}
              </p>
            )}
            <button type="submit" className="rt-btn-primary" disabled={saving}>
              <Plus size={15} aria-hidden="true" />
              {saving ? 'Saving…' : 'Add target'}
            </button>
          </div>
        </form>
      </section>

      <section className="rt-card rt-panel" aria-labelledby="rt-scope-check">
        <div className="rt-card-header">
          <div>
            <h2 className="rt-card-title" id="rt-scope-check">
              Scope check
            </h2>
            <p className="rt-card-subtitle">
              Ask the gateway whether a host is authorised, before a tool ever fires
            </p>
          </div>
        </div>

        <form className="rt-inline-form" onSubmit={handleProbe}>
          <div className="rt-field">
            <label htmlFor="rt-probe-target">Target</label>
            <select
              id="rt-probe-target"
              className="rt-select"
              value={probeTarget}
              onChange={event => setProbeTarget(event.target.value)}
            >
              <option value="">Select a target…</option>
              {targets.map(target => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rt-field rt-grow">
            <label htmlFor="rt-probe-value">Host or IP</label>
            <input
              id="rt-probe-value"
              className="rt-input"
              placeholder="www.example.org"
              value={probeValue}
              onChange={event => setProbeValue(event.target.value)}
            />
          </div>

          <button type="submit" className="rt-btn-ghost">
            <ShieldCheck size={15} aria-hidden="true" />
            Check
          </button>
        </form>

        {probeResult && (
          <p
            className="rt-scope-result"
            data-in-scope={probeResult.in_scope}
            role="status"
          >
            {probeResult.in_scope
              ? `${probeResult.value} is IN SCOPE`
              : `${probeResult.value} is OUT OF SCOPE`}
          </p>
        )}
      </section>

      <section className="rt-card rt-panel" aria-labelledby="rt-target-list">
        <div className="rt-card-header">
          <div>
            <h2 className="rt-card-title" id="rt-target-list">
              Registered targets
            </h2>
            <p className="rt-card-subtitle">{targets.length} registered</p>
          </div>
        </div>

        {loading ? (
          <p className="rt-placeholder">Loading targets…</p>
        ) : targets.length === 0 ? (
          <p className="rt-placeholder">
            <Crosshair size={18} aria-hidden="true" />
            <br />
            No targets yet. Add one above to define what the platform may scan.
          </p>
        ) : (
          <div className="rt-table-wrap">
            <table className="rt-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Root domains</th>
                  <th scope="col">CIDRs</th>
                  <th scope="col">Out of scope</th>
                  <th scope="col">
                    <span className="rt-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {targets.map(target => (
                  <tr key={target.id}>
                    <td className="rt-cell-strong">{target.name}</td>
                    <td className="rt-cell-mono">{target.root_domains.join(', ') || '—'}</td>
                    <td className="rt-cell-mono">{target.cidrs.join(', ') || '—'}</td>
                    <td className="rt-cell-mono rt-cell-danger">
                      {target.out_of_scope.join(', ') || '—'}
                    </td>
                    <td className="rt-cell-actions">
                      <button
                        type="button"
                        className="rt-icon-button"
                        aria-label={`Delete target ${target.name}`}
                        onClick={() => void handleDelete(target)}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </td>
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
