import {
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_ORDER,
  TOOLS,
  type DashboardFilters,
  type KpiSet,
  type PeriodKey,
  type RunRecord,
  type StatusSlice,
  type ToolBar,
  type VolumePoint,
} from '../types';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Every date part is read in UTC. Using local parts would make bucketing depend
 * on the machine's timezone, so the same run would land on different days for
 * different operators — and the test suite would pass or fail depending on
 * where it ran.
 */
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcHour(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
    ),
  );
}

function dayLabel(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function hourLabel(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function hourKey(date: Date): string {
  return date.toISOString().slice(0, 13);
}

export function periodBucketCount(period: PeriodKey): number {
  switch (period) {
    case '24h':
      return 24;
    case '7d':
      return 7;
    case '30d':
      return 30;
  }
}

/**
 * Inclusive lower bound of a period. Shared by the filter and the chart series
 * so a KPI can never disagree with the bars drawn beside it.
 */
export function periodStart(period: PeriodKey, now: Date): Date {
  const buckets = periodBucketCount(period);
  if (period === '24h') {
    return new Date(startOfUtcHour(now).getTime() - (buckets - 1) * HOUR_MS);
  }
  return new Date(startOfUtcDay(now).getTime() - (buckets - 1) * DAY_MS);
}

export function filterRuns(
  runs: RunRecord[],
  filters: DashboardFilters,
  now: Date,
): RunRecord[] {
  // Lower bound only. "Last 7 days" means "since seven days ago", and a run
  // just dispatched must show up immediately — an upper bound would race the
  // clock passed in from above and silently swallow it.
  const from = periodStart(filters.period, now).getTime();

  return runs.filter(run => {
    const at = Date.parse(run.startedAt);
    if (Number.isNaN(at) || at < from) return false;
    if (filters.tool !== 'all' && run.tool !== filters.tool) return false;
    if (filters.status !== 'all' && run.status !== filters.status) return false;
    if (filters.program !== 'all' && run.program !== filters.program) return false;
    return true;
  });
}

export function selectKpis(runs: RunRecord[]): KpiSet {
  const kpis: KpiSet = {
    total: runs.length,
    active: 0,
    succeeded: 0,
    failed: 0,
    assets: 0,
  };

  for (const run of runs) {
    kpis.assets += run.assetCount;

    // queued and running are both "still in flight" — an operator acts on the
    // pair, not on either alone.
    if (run.status === 'queued' || run.status === 'running') kpis.active += 1;
    else if (run.status === 'success' || run.status === 'completed_with_warnings') {
      kpis.succeeded += 1;
    } else if (run.status === 'failed') kpis.failed += 1;
  }

  return kpis;
}

export function selectVolumeSeries(
  runs: RunRecord[],
  period: PeriodKey,
  now: Date,
): VolumePoint[] {
  const buckets = periodBucketCount(period);
  const hourly = period === '24h';
  const step = hourly ? HOUR_MS : DAY_MS;
  const start = periodStart(period, now).getTime();

  const counts = new Map<string, number>();
  const series: VolumePoint[] = [];

  for (let i = 0; i < buckets; i += 1) {
    const at = new Date(start + i * step);
    const key = hourly ? hourKey(at) : dayKey(at);
    counts.set(key, 0);
    series.push({ date: key, label: hourly ? hourLabel(at) : dayLabel(at), count: 0 });
  }

  for (const run of runs) {
    const at = Date.parse(run.startedAt);
    if (Number.isNaN(at)) continue;
    const key = hourly ? hourKey(new Date(at)) : dayKey(new Date(at));
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }

  return series.map(point => ({ ...point, count: counts.get(point.date) ?? 0 }));
}

export function selectStatusDistribution(runs: RunRecord[]): StatusSlice[] {
  const counts = new Map(STATUS_ORDER.map(status => [status, 0]));

  for (const run of runs) {
    const current = counts.get(run.status);
    if (current !== undefined) counts.set(run.status, current + 1);
  }

  return STATUS_ORDER.map(status => ({
    status,
    label: STATUS_LABELS[status],
    value: counts.get(status) ?? 0,
    color: STATUS_COLORS[status],
  }));
}

export function selectToolDistribution(runs: RunRecord[]): ToolBar[] {
  const counts = new Map(TOOLS.map(tool => [tool, 0]));

  for (const run of runs) {
    const current = counts.get(run.tool);
    if (current !== undefined) counts.set(run.tool, current + 1);
  }

  return TOOLS.map(tool => ({ tool, value: counts.get(tool) ?? 0 }));
}

/**
 * Axis ticks from 0 to max in `steps` even intervals. A max of zero would give
 * a degenerate axis, so an empty series falls back to a 0..4 scale — the chart
 * still draws its frame, which is what tells the operator "filtered to nothing"
 * rather than "failed to load".
 */
export function selectAxisTicks(max: number, steps = 4): number[] {
  const top = max > 0 ? max : steps;
  const step = top / steps;
  return Array.from({ length: steps + 1 }, (_, i) => Number((step * i).toFixed(4)));
}

/**
 * Growth of the second half of the series over the first, as a percentage.
 * Returns 0 when the earlier half is empty: dividing by it would yield
 * Infinity, and "∞% growth" is not a thing a badge can usefully say.
 */
export function selectTrendPercent(series: VolumePoint[]): number {
  if (series.length < 2) return 0;

  const middle = Math.floor(series.length / 2);
  const sum = (points: VolumePoint[]) => points.reduce((acc, p) => acc + p.count, 0);
  const earlier = sum(series.slice(0, middle));
  const later = sum(series.slice(middle));

  if (earlier === 0) return 0;
  return Math.round(((later - earlier) / earlier) * 100);
}

/** Strips trailing zeros so an axis reads "1.5" and "3" rather than "1.50". */
export function formatTick(value: number): string {
  return Number(value.toFixed(2)).toString();
}
