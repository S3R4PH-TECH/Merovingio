import { describe, expect, it } from 'vitest';
import {
  filterRuns,
  selectAxisTicks,
  selectKpis,
  selectStatusDistribution,
  selectToolDistribution,
  selectTrendPercent,
  selectVolumeSeries,
} from '../lib/selectors';
import type { DashboardFilters, RunRecord } from '../types';

const NOW = new Date('2026-08-07T18:00:00.000Z');

function make(overrides: Partial<RunRecord> & { id: string }): RunRecord {
  return {
    workflow: 'recon-baseline',
    target: 'example.org',
    tool: 'theharvester',
    status: 'queued',
    startedAt: '2026-08-07T10:00:00.000Z',
    assetCount: 0,
    program: 'Internal',
    ...overrides,
  };
}

const ALL: DashboardFilters = { period: '7d', tool: 'all', status: 'all', program: 'all' };

describe('filterRuns', () => {
  it('keeps only runs inside the 7 day window', () => {
    const runs = [
      make({ id: 'in', startedAt: '2026-08-05T10:00:00.000Z' }),
      make({ id: 'out', startedAt: '2026-07-01T10:00:00.000Z' }),
    ];
    expect(filterRuns(runs, ALL, NOW).map(r => r.id)).toEqual(['in']);
  });

  it('narrows the window to 24 hours', () => {
    const runs = [
      make({ id: 'today', startedAt: '2026-08-07T09:00:00.000Z' }),
      make({ id: 'five-days-ago', startedAt: '2026-08-02T09:00:00.000Z' }),
    ];
    expect(filterRuns(runs, { ...ALL, period: '24h' }, NOW).map(r => r.id)).toEqual(['today']);
  });

  it('widens the window to 30 days', () => {
    const runs = [
      make({ id: 'recent', startedAt: '2026-08-05T10:00:00.000Z' }),
      make({ id: 'three-weeks', startedAt: '2026-07-20T10:00:00.000Z' }),
      make({ id: 'ancient', startedAt: '2026-01-01T10:00:00.000Z' }),
    ];
    expect(filterRuns(runs, { ...ALL, period: '30d' }, NOW).map(r => r.id)).toEqual([
      'recent',
      'three-weeks',
    ]);
  });

  it('filters by tool', () => {
    const runs = [
      make({ id: 'harvester', tool: 'theharvester' }),
      make({ id: 'nmap', tool: 'net-scan' }),
    ];
    expect(filterRuns(runs, { ...ALL, tool: 'net-scan' }, NOW).map(r => r.id)).toEqual(['nmap']);
  });

  it('filters by run status', () => {
    const runs = [
      make({ id: 'ok', status: 'success' }),
      make({ id: 'bad', status: 'failed' }),
    ];
    expect(filterRuns(runs, { ...ALL, status: 'failed' }, NOW).map(r => r.id)).toEqual(['bad']);
  });

  it('filters by program, the real tenancy boundary', () => {
    const runs = [
      make({ id: 'internal', program: 'Internal' }),
      make({ id: 'bounty', program: 'Bug Bounty' }),
    ];
    expect(filterRuns(runs, { ...ALL, program: 'Bug Bounty' }, NOW).map(r => r.id)).toEqual([
      'bounty',
    ]);
  });

  it('combines filters conjunctively and can yield nothing', () => {
    const runs = [
      make({ id: 'a', tool: 'fuzz-svc', status: 'failed' }),
      make({ id: 'b', tool: 'net-scan', status: 'success' }),
    ];
    expect(filterRuns(runs, { ...ALL, tool: 'fuzz-svc', status: 'success' }, NOW)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const runs = [make({ id: 'a' }), make({ id: 'b' })];
    const snapshot = [...runs];
    filterRuns(runs, { ...ALL, status: 'success' }, NOW);
    expect(runs).toEqual(snapshot);
  });
});

describe('selectKpis', () => {
  it('counts queued and running together as active', () => {
    const runs = [
      make({ id: '1', status: 'queued' }),
      make({ id: '2', status: 'running' }),
      make({ id: '3', status: 'running' }),
      make({ id: '4', status: 'success' }),
      make({ id: '5', status: 'failed' }),
    ];
    expect(selectKpis(runs).active).toBe(3);
  });

  it('counts completed_with_warnings as succeeded, not failed', () => {
    const runs = [
      make({ id: '1', status: 'success' }),
      make({ id: '2', status: 'completed_with_warnings' }),
      make({ id: '3', status: 'failed' }),
    ];
    const kpis = selectKpis(runs);
    expect(kpis.succeeded).toBe(2);
    expect(kpis.failed).toBe(1);
  });

  it('sums assets discovered across runs', () => {
    const runs = [
      make({ id: '1', assetCount: 83 }),
      make({ id: '2', assetCount: 42 }),
      make({ id: '3', assetCount: 0 }),
    ];
    expect(selectKpis(runs).assets).toBe(125);
  });

  it('returns zeros for an empty list rather than undefined', () => {
    expect(selectKpis([])).toEqual({
      total: 0,
      active: 0,
      succeeded: 0,
      failed: 0,
      assets: 0,
    });
  });
});

describe('selectVolumeSeries', () => {
  it('produces one point per day across a 7 day window', () => {
    expect(selectVolumeSeries([], '7d', NOW)).toHaveLength(7);
  });

  it('produces 30 points for the 30 day window', () => {
    expect(selectVolumeSeries([], '30d', NOW)).toHaveLength(30);
  });

  it('produces 24 hourly points for the 24 hour window', () => {
    expect(selectVolumeSeries([], '24h', NOW)).toHaveLength(24);
  });

  it('ends on the current day and labels it', () => {
    const series = selectVolumeSeries([], '7d', NOW);
    expect(series[0].label).toBe('Aug 1');
    expect(series[series.length - 1].label).toBe('Aug 7');
  });

  it('buckets runs into the right day', () => {
    const runs = [
      make({ id: 'a', startedAt: '2026-08-05T02:00:00.000Z' }),
      make({ id: 'b', startedAt: '2026-08-05T22:00:00.000Z' }),
      make({ id: 'c', startedAt: '2026-08-07T09:00:00.000Z' }),
    ];
    const byLabel = Object.fromEntries(
      selectVolumeSeries(runs, '7d', NOW).map(p => [p.label, p.count]),
    );
    expect(byLabel['Aug 5']).toBe(2);
    expect(byLabel['Aug 7']).toBe(1);
    expect(byLabel['Aug 6']).toBe(0);
  });

  it('reports zero counts instead of omitting empty buckets', () => {
    expect(selectVolumeSeries([], '7d', NOW).every(p => p.count === 0)).toBe(true);
  });
});

describe('selectStatusDistribution', () => {
  it('always returns the five gateway statuses in canonical order', () => {
    expect(selectStatusDistribution([]).map(s => s.status)).toEqual([
      'success',
      'running',
      'queued',
      'completed_with_warnings',
      'failed',
    ]);
  });

  it('uses operator-facing labels', () => {
    expect(selectStatusDistribution([]).map(s => s.label)).toEqual([
      'Success',
      'Running',
      'Queued',
      'Warnings',
      'Failed',
    ]);
  });

  it('counts each status', () => {
    const runs = [
      make({ id: '1', status: 'success' }),
      make({ id: '2', status: 'success' }),
      make({ id: '3', status: 'running' }),
      make({ id: '4', status: 'completed_with_warnings' }),
    ];
    const byStatus = Object.fromEntries(
      selectStatusDistribution(runs).map(s => [s.status, s.value]),
    );
    expect(byStatus).toEqual({
      success: 2,
      running: 1,
      queued: 0,
      completed_with_warnings: 1,
      failed: 0,
    });
  });

  it('carries a colour token for each slice', () => {
    for (const slice of selectStatusDistribution([])) {
      expect(slice.color).toMatch(/^var\(--rt-status-/);
    }
  });
});

describe('selectToolDistribution', () => {
  it('returns every registered TES tool even when unused', () => {
    expect(selectToolDistribution([]).map(t => t.tool)).toEqual([
      'theharvester',
      'pd-recon',
      'pd-scan',
      'pd-crawler',
      'fuzz-svc',
      'net-scan',
    ]);
  });

  it('counts runs per tool', () => {
    const runs = [
      make({ id: '1', tool: 'theharvester' }),
      make({ id: '2', tool: 'theharvester' }),
      make({ id: '3', tool: 'net-scan' }),
    ];
    const byTool = Object.fromEntries(selectToolDistribution(runs).map(t => [t.tool, t.value]));
    expect(byTool.theharvester).toBe(2);
    expect(byTool['net-scan']).toBe(1);
    expect(byTool['pd-scan']).toBe(0);
  });
});

describe('selectAxisTicks', () => {
  it('produces evenly spaced ticks for a maximum of 3', () => {
    expect(selectAxisTicks(3)).toEqual([0, 0.75, 1.5, 2.25, 3]);
  });

  it('never divides by zero when the series is empty', () => {
    expect(selectAxisTicks(0)).toEqual([0, 1, 2, 3, 4]);
  });

  it('honours a custom step count', () => {
    expect(selectAxisTicks(4, 2)).toEqual([0, 2, 4]);
  });
});

describe('selectTrendPercent', () => {
  it('is zero when the two halves match', () => {
    const flat = Array.from({ length: 6 }, (_, i) => ({
      date: `d${i}`,
      label: `d${i}`,
      count: 2,
    }));
    expect(selectTrendPercent(flat)).toBe(0);
  });

  it('is finite rather than Infinity when the earlier half is empty', () => {
    const series = [
      { date: 'a', label: 'a', count: 0 },
      { date: 'b', label: 'b', count: 0 },
      { date: 'c', label: 'c', count: 5 },
      { date: 'd', label: 'd', count: 5 },
    ];
    expect(Number.isFinite(selectTrendPercent(series))).toBe(true);
  });

  it('reports growth as a positive percentage', () => {
    const series = [
      { date: 'a', label: 'a', count: 2 },
      { date: 'b', label: 'b', count: 2 },
      { date: 'c', label: 'c', count: 3 },
      { date: 'd', label: 'd', count: 3 },
    ];
    expect(selectTrendPercent(series)).toBe(50);
  });
});
