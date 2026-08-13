import { useMemo, useRef, useState } from 'react';
import {
  ClipboardPaste,
  Crosshair,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { checkScope, createTarget, deleteTarget } from '../api/gateway';
import { ApiError } from '../api/client';
import {
  classifyScopeEntries,
  classifyScopeEntry,
  parseScopeList,
  splitScopeInput,
} from '../lib/scope';
import type { TargetItem } from '../types';

/**
 * A .txt of hosts is a few hundred lines in practice. The cap exists so a
 * mis-picked file cannot lock the tab up parsing a binary — it is a guard, not
 * a limit anyone should ever meet.
 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * FileReader rather than the terser `await file.text()`: Blob.text() is absent
 * from jsdom, which would make the upload path the one injection mode no test
 * could ever exercise. FileReader is supported everywhere this app runs.
 */
function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('could not be read'));
    reader.readAsText(file);
  });
}

type InjectionMode = 'single' | 'paste' | 'file';

const MODES: { key: InjectionMode; label: string; icon: typeof Plus }[] = [
  { key: 'single', label: 'One by one', icon: Plus },
  { key: 'paste', label: 'Paste list', icon: ClipboardPaste },
  { key: 'file', label: 'Upload .txt', icon: Upload },
];

interface ScopePanelProps {
  /** Rendered as context — what the platform may already touch. */
  targets: TargetItem[];
  /** Called after a target is created so the host can refetch. */
  onChanged: () => void | Promise<void>;
}

export function ScopePanel({ targets, onChanged }: ScopePanelProps) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<InjectionMode>('single');

  const [singleValue, setSingleValue] = useState('');
  const [pasteValue, setPasteValue] = useState('');
  const [fileNote, setFileNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // One staging list behind all three modes. Whether a host was typed, pasted
  // or read out of a file stops mattering the moment it lands here, so the
  // operator reviews a single list before anything is created.
  const [entries, setEntries] = useState<string[]>([]);
  const [outRaw, setOutRaw] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Kept apart from formError: a failed delete or scope check has nothing to
  // do with the target being drafted above, and showing it under the create
  // button would read as a reason that draft was rejected.
  const [listError, setListError] = useState<string | null>(null);
  const [probeTarget, setProbeTarget] = useState('');
  const [probeValue, setProbeValue] = useState('');
  const [probeResult, setProbeResult] = useState<{ value: string; in_scope: boolean } | null>(
    null,
  );

  const classified = useMemo(() => classifyScopeEntries(entries), [entries]);
  const outOfScope = useMemo(() => parseScopeList(outRaw), [outRaw]);

  const addEntries = (raw: string): number => {
    const incoming = splitScopeInput(raw);
    let added = 0;

    setEntries(current => {
      const seen = new Set(current);
      const next = [...current];
      for (const entry of incoming) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        next.push(entry);
        added += 1;
      }
      return next;
    });

    return added;
  };

  const removeEntry = (entry: string) =>
    setEntries(current => current.filter(item => item !== entry));

  const handleAddSingle = (event: React.FormEvent) => {
    event.preventDefault();
    if (singleValue.trim() === '') return;
    addEntries(singleValue);
    setSingleValue('');
  };

  const handleAddPaste = () => {
    if (pasteValue.trim() === '') return;
    addEntries(pasteValue);
    setPasteValue('');
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFormError(null);

    if (file.size > MAX_FILE_BYTES) {
      setFormError(`${file.name} is larger than 2 MB — that is not a host list.`);
    } else {
      try {
        const added = addEntries(await readTextFile(file));
        setFileNote(`${file.name} — ${added} new host${added === 1 ? '' : 's'}`);
      } catch {
        // Reported in the form rather than left as an unhandled rejection —
        // an import that silently did nothing is the worst outcome here.
        setFileNote(null);
        setFormError(`${file.name} could not be read.`);
      }
    }

    // Reset the control so picking the same file twice still fires a change.
    if (fileInput.current) fileInput.current.value = '';
  };

  const handleDelete = async (target: TargetItem) => {
    setListError(null);
    try {
      await deleteTarget(target.id);
      // A deleted target can no longer answer a scope check, so a stale
      // selection here would probe something that is gone.
      if (probeTarget === target.id) {
        setProbeTarget('');
        setProbeResult(null);
      }
      await onChanged();
    } catch (caught) {
      setListError(caught instanceof ApiError ? caught.message : 'Failed to delete target');
    }
  };

  const handleProbe = async (event: React.FormEvent) => {
    event.preventDefault();
    if (probeTarget === '' || probeValue.trim() === '') return;

    setListError(null);
    try {
      setProbeResult(await checkScope(probeTarget, probeValue.trim()));
    } catch (caught) {
      setProbeResult(null);
      setListError(caught instanceof ApiError ? caught.message : 'Scope check failed');
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (name.trim() === '') {
      setFormError('Target name is required');
      return;
    }
    if (classified.rootDomains.length === 0 && classified.cidrs.length === 0) {
      // A target with no scope authorises nothing, and an offensive tool
      // pointed at an empty scope is the one case worth blocking outright.
      setFormError('Add at least one host — a target with no scope runs nothing');
      return;
    }
    if (classified.invalid.length > 0) {
      setFormError(`Remove or fix the rejected entries: ${classified.invalid.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      await createTarget({
        name: name.trim(),
        root_domains: classified.rootDomains,
        cidrs: classified.cidrs,
        out_of_scope: outOfScope.valid,
      });
      setName('');
      setEntries([]);
      setOutRaw('');
      setFileNote(null);
      await onChanged();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Failed to create target');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rt-card rt-panel rt-scope-panel" aria-labelledby="rt-scope-panel-title">
      <div className="rt-card-header">
        <div>
          <h2 className="rt-card-title" id="rt-scope-panel-title">
            Scope
          </h2>
          <p className="rt-card-subtitle">What the platform is authorised to touch</p>
        </div>
      </div>

      <form className="rt-scope-form" onSubmit={handleCreate}>
        <div className="rt-field">
          <label htmlFor="rt-sp-name">Target name</label>
          <input
            id="rt-sp-name"
            className="rt-input"
            placeholder="Acme production"
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </div>

        {/*
          The three modes write to the same staging list, so switching between
          them mid-entry never costs the operator what they already added.
        */}
        <div className="rt-scope-modes" role="group" aria-label="How to add hosts">
          {MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className="rt-scope-mode"
              data-active={mode === key}
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {mode === 'single' && (
          <div className="rt-field">
            <label htmlFor="rt-sp-single">Host, domain or CIDR</label>
            <div className="rt-scope-single">
              <input
                id="rt-sp-single"
                className="rt-input"
                placeholder="example.org"
                value={singleValue}
                onChange={event => setSingleValue(event.target.value)}
                onKeyDown={event => {
                  // Enter adds the host instead of submitting the form — the
                  // form's submit creates the whole target, which is not what
                  // anyone means while still typing entries.
                  if (event.key === 'Enter') handleAddSingle(event);
                }}
              />
              <button type="button" className="rt-btn-ghost" onClick={handleAddSingle}>
                <Plus size={15} aria-hidden="true" />
                Add
              </button>
            </div>
          </div>
        )}

        {mode === 'paste' && (
          <div className="rt-field">
            <label htmlFor="rt-sp-paste">Paste hosts</label>
            <textarea
              id="rt-sp-paste"
              className="rt-textarea"
              placeholder={'example.org\napi.example.org\n10.0.0.0/24'}
              value={pasteValue}
              onChange={event => setPasteValue(event.target.value)}
            />
            <p className="rt-field-note">
              One per line, or separated by commas, semicolons or spaces. `#` comments are ignored.
            </p>
            <button type="button" className="rt-btn-ghost" onClick={handleAddPaste}>
              <ClipboardPaste size={15} aria-hidden="true" />
              Add pasted hosts
            </button>
          </div>
        )}

        {mode === 'file' && (
          <div className="rt-field">
            <label htmlFor="rt-sp-file">Host list file</label>
            <input
              id="rt-sp-file"
              ref={fileInput}
              className="rt-input rt-scope-file"
              type="file"
              accept=".txt,text/plain"
              onChange={event => void handleFile(event)}
            />
            <p className="rt-field-note">
              A plain .txt, one host per line — the shape every recon tool already writes.
            </p>
            {fileNote && (
              <p className="rt-field-note rt-scope-file-note" role="status">
                {fileNote}
              </p>
            )}
          </div>
        )}

        <div className="rt-field">
          <div className="rt-scope-staged-head">
            <span id="rt-sp-staged-label">
              Staged hosts <span className="rt-count">{entries.length}</span>
            </span>
            {entries.length > 0 && (
              <button
                type="button"
                className="rt-link-button"
                onClick={() => {
                  setEntries([]);
                  setFileNote(null);
                }}
              >
                Clear all
              </button>
            )}
          </div>

          {entries.length === 0 ? (
            <p className="rt-field-note">
              Nothing staged yet. Hosts added by any of the three methods land here first.
            </p>
          ) : (
            <ul className="rt-scope-chips" aria-labelledby="rt-sp-staged-label">
              {entries.map(entry => {
                const kind = classifyScopeEntry(entry);
                return (
                  <li key={entry} className="rt-scope-chip" data-kind={kind}>
                    <span className="rt-scope-chip-kind" aria-hidden="true">
                      {kind === 'domain' ? 'DOM' : kind === 'cidr' ? 'NET' : '!'}
                    </span>
                    <span className="rt-scope-chip-value">{entry}</span>
                    <button
                      type="button"
                      className="rt-scope-chip-remove"
                      aria-label={`Remove ${entry}`}
                      onClick={() => removeEntry(entry)}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/*
            Counted, not just listed: root_domains and cidrs are two different
            fields on the Target, and this is where the operator confirms the
            split landed the way they expected before anything is created.
          */}
          {entries.length > 0 && (
            <p className="rt-field-note" role="status">
              {classified.rootDomains.length} domain
              {classified.rootDomains.length === 1 ? '' : 's'} ·{' '}
              {classified.cidrs.length} network{classified.cidrs.length === 1 ? '' : 's'}
              {classified.invalid.length > 0 && (
                <span className="rt-field-warn-inline">
                  {' '}
                  · {classified.invalid.length} rejected
                </span>
              )}
            </p>
          )}
        </div>

        <div className="rt-field">
          <label htmlFor="rt-sp-out">
            Out of scope <span className="rt-count">{outOfScope.valid.length}</span>
          </label>
          <textarea
            id="rt-sp-out"
            className="rt-textarea rt-textarea-sm"
            placeholder={'admin.example.org\n10.0.0.5'}
            value={outRaw}
            onChange={event => setOutRaw(event.target.value)}
          />
          <p className="rt-field-note">Out-of-scope always wins over in-scope.</p>
        </div>

        <div className="rt-form-actions">
          {formError && (
            <p className="rt-field-error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="rt-btn-primary" disabled={saving}>
            <Crosshair size={15} aria-hidden="true" />
            {saving ? 'Saving…' : 'Create target'}
          </button>
        </div>
      </form>

      <div className="rt-scope-registered">
        <p className="rt-scope-registered-head" id="rt-sp-registered-label">
          Registered targets <span className="rt-count">{targets.length}</span>
        </p>

        {listError && (
          <p className="rt-field-error" role="alert">
            {listError}
          </p>
        )}

        {targets.length === 0 ? (
          <p className="rt-field-note">No targets yet — nothing can be dispatched.</p>
        ) : (
          <ul className="rt-scope-target-list" aria-labelledby="rt-sp-registered-label">
            {targets.map(target => (
              <li key={target.id} className="rt-scope-target">
                <div className="rt-scope-target-body">
                  <span className="rt-scope-target-name">{target.name}</span>
                  <span className="rt-scope-target-scope">
                    {[...target.root_domains, ...target.cidrs].join(', ') || '—'}
                  </span>
                  {target.out_of_scope.length > 0 && (
                    <span className="rt-scope-target-out">
                      except {target.out_of_scope.join(', ')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="rt-icon-button"
                  aria-label={`Delete target ${target.name}`}
                  onClick={() => void handleDelete(target)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*
        The gateway is the authority on scope, not this form's parser — asking
        it directly is the only way to confirm a host before a tool fires,
        including the out_of_scope vetoes an allow-list alone cannot express.
      */}
      <div className="rt-scope-check">
        <p className="rt-scope-registered-head">Scope check</p>
        <form className="rt-scope-check-form" onSubmit={handleProbe}>
          <div className="rt-field">
            <label htmlFor="rt-sp-probe-target">Target</label>
            <select
              id="rt-sp-probe-target"
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

          <div className="rt-field">
            <label htmlFor="rt-sp-probe-value">Host or IP</label>
            <input
              id="rt-sp-probe-value"
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
          <p className="rt-scope-result" data-in-scope={probeResult.in_scope} role="status">
            {probeResult.in_scope
              ? `${probeResult.value} is IN SCOPE`
              : `${probeResult.value} is OUT OF SCOPE`}
          </p>
        )}
      </div>
    </section>
  );
}
