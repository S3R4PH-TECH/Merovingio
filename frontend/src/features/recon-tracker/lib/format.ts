/** Absolute timestamp, short form — operators compare runs, so seconds matter. */
export function formatWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';

  return at.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Elapsed time. An unfinished run reports how long it has been going rather
 * than a dash — "running for 14m" is the number an operator is actually
 * watching when deciding whether something is stuck.
 */
export function formatDuration(startIso: string, endIso?: string, now: Date = new Date()): string {
  const start = Date.parse(startIso);
  if (Number.isNaN(start)) return '—';

  const end = endIso ? Date.parse(endIso) : now.getTime();
  if (Number.isNaN(end)) return '—';

  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Shortens a UUID for display without pretending it is the whole thing. */
export function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}
