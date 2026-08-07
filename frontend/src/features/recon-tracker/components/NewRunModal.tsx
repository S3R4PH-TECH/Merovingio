import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { TargetItem, WorkflowItem } from '../types';

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface DispatchInput {
  workflowId: string;
  targetId: string;
}

interface NewRunModalProps {
  open: boolean;
  workflows: WorkflowItem[];
  targets: TargetItem[];
  onClose: () => void;
  onDispatch: (input: DispatchInput) => Promise<void>;
}

/**
 * Dispatches a real run through POST /workflows/{id}/run. Both selects are
 * required because the gateway needs a registered workflow and an in-scope
 * target — there is no meaningful default for either.
 */
export function NewRunModal({
  open,
  workflows,
  targets,
  onClose,
  onDispatch,
}: NewRunModalProps) {
  const [workflowId, setWorkflowId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const titleId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) return;

    // Remember who opened the dialog so focus can be handed straight back when
    // it closes; otherwise Escape drops focus onto <body>.
    const opener = document.activeElement as HTMLElement | null;

    setWorkflowId(workflows[0]?.id ?? '');
    setTargetId(targets[0]?.id ?? '');
    setError(null);
    firstFieldRef.current?.focus();

    return () => opener?.focus();
  }, [open, workflows, targets]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (workflowId === '') {
      setError('Select a workflow');
      return;
    }
    if (targetId === '') {
      setError('Select a target — a run without a target has no authorised scope');
      return;
    }

    setBusy(true);
    try {
      await onDispatch({ workflowId, targetId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Dispatch failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rt-overlay" role="presentation">
      <div
        className="rt-modal"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="rt-modal-header">
          <h2 className="rt-modal-title" id={titleId}>
            New Run
          </h2>
          <button
            type="button"
            className="rt-icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="rt-modal-body">
            <div className="rt-field">
              <label htmlFor="rt-workflow">Workflow</label>
              <select
                id="rt-workflow"
                ref={firstFieldRef}
                className="rt-select"
                value={workflowId}
                aria-describedby={error ? errorId : undefined}
                onChange={event => {
                  setWorkflowId(event.target.value);
                  if (error) setError(null);
                }}
              >
                <option value="">Select a workflow…</option>
                {workflows.map(workflow => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name} (v{workflow.current_version})
                  </option>
                ))}
              </select>
              {workflows.length === 0 && (
                <p className="rt-field-warn">
                  No workflows registered. Register one with POST
                  /workspaces/&#123;id&#125;/workflows.
                </p>
              )}
            </div>

            <div className="rt-field">
              <label htmlFor="rt-target">Target</label>
              <select
                id="rt-target"
                className="rt-select"
                value={targetId}
                onChange={event => {
                  setTargetId(event.target.value);
                  if (error) setError(null);
                }}
              >
                <option value="">Select a target…</option>
                {targets.map(target => (
                  <option key={target.id} value={target.id}>
                    {target.name} — {target.root_domains.join(', ') || target.cidrs.join(', ')}
                  </option>
                ))}
              </select>
              {targets.length === 0 && (
                <p className="rt-field-warn">
                  No targets registered. Add one under Scope &amp; Targets first.
                </p>
              )}
            </div>

            {error && (
              <p className="rt-field-error" id={errorId} role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="rt-modal-footer">
            <button type="button" className="rt-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="rt-btn-primary" disabled={busy}>
              {busy ? 'Dispatching…' : 'Dispatch Run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
