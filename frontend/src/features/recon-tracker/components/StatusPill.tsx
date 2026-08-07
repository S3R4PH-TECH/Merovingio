import { STATUS_LABELS, type RunStatus } from '../types';

const KNOWN: readonly string[] = [
  'queued',
  'running',
  'success',
  'completed_with_warnings',
  'failed',
];

interface StatusPillProps {
  status: string;
}

/**
 * Carries the status word as text, not only as colour — a colour-blind operator
 * reads the same information as anyone else (WCAG 1.4.1).
 */
export function StatusPill({ status }: StatusPillProps) {
  const known = KNOWN.includes(status);
  const label = known ? STATUS_LABELS[status as RunStatus] : status;

  return (
    <span className="rt-pill" data-status={known ? status : 'queued'}>
      <span className="rt-pill-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
