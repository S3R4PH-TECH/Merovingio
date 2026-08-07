import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunVolumeChart } from '../components/RunVolumeChart';
import { StatusDonutChart } from '../components/StatusDonutChart';
import { RunsByToolChart } from '../components/RunsByToolChart';
import type { StatusSlice, ToolBar, VolumePoint } from '../types';

const VOLUME: VolumePoint[] = [
  { date: '2026-08-01', label: 'Aug 1', count: 2 },
  { date: '2026-08-02', label: 'Aug 2', count: 1 },
  { date: '2026-08-03', label: 'Aug 3', count: 0 },
  { date: '2026-08-04', label: 'Aug 4', count: 3 },
  { date: '2026-08-05', label: 'Aug 5', count: 1 },
  { date: '2026-08-06', label: 'Aug 6', count: 2 },
  { date: '2026-08-07', label: 'Aug 7', count: 1 },
];

const SLICES: StatusSlice[] = [
  { status: 'success', label: 'Success', value: 4, color: 'var(--rt-status-success)' },
  { status: 'running', label: 'Running', value: 2, color: 'var(--rt-status-running)' },
  { status: 'queued', label: 'Queued', value: 1, color: 'var(--rt-status-queued)' },
  {
    status: 'completed_with_warnings',
    label: 'Warnings',
    value: 2,
    color: 'var(--rt-status-warning)',
  },
  { status: 'failed', label: 'Failed', value: 1, color: 'var(--rt-status-failed)' },
];

const TOOLS: ToolBar[] = [
  { tool: 'theharvester', value: 2 },
  { tool: 'pd-recon', value: 2 },
  { tool: 'pd-scan', value: 2 },
  { tool: 'pd-crawler', value: 1 },
  { tool: 'fuzz-svc', value: 2 },
  { tool: 'net-scan', value: 1 },
];

describe('RunVolumeChart', () => {
  it('titles the card and states the period', () => {
    render(<RunVolumeChart data={VOLUME} periodLabel="Last 7 days" trendPercent={0} />);
    expect(screen.getByRole('heading', { name: /run volume/i })).toBeInTheDocument();
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
  });

  it('shows the trend badge', () => {
    render(<RunVolumeChart data={VOLUME} periodLabel="Last 7 days" trendPercent={0} />);
    expect(screen.getByText(/0%/)).toBeInTheDocument();
  });

  it('draws one bar per data point', () => {
    const { container } = render(
      <RunVolumeChart data={VOLUME} periodLabel="Last 7 days" trendPercent={0} />,
    );
    expect(container.querySelectorAll('[data-testid="volume-bar"]')).toHaveLength(7);
  });

  it('labels the x axis with every date', () => {
    render(<RunVolumeChart data={VOLUME} periodLabel="Last 7 days" trendPercent={0} />);
    for (const point of VOLUME) {
      expect(screen.getByText(point.label)).toBeInTheDocument();
    }
  });

  it('is reachable as an image with a textual description of the series', () => {
    render(<RunVolumeChart data={VOLUME} periodLabel="Last 7 days" trendPercent={0} />);
    const figure = screen.getByRole('img', { name: /run volume/i });
    expect(figure).toHaveAccessibleName(expect.stringContaining('Aug 1'));
    expect(figure).toHaveAccessibleName(expect.stringContaining('Aug 7'));
  });

  it('hides the raw svg from assistive tech', () => {
    const { container } = render(
      <RunVolumeChart data={VOLUME} periodLabel="Last 7 days" trendPercent={0} />,
    );
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the axis visible and explains an empty result', () => {
    const empty = VOLUME.map(p => ({ ...p, count: 0 }));
    render(<RunVolumeChart data={empty} periodLabel="Last 7 days" trendPercent={0} isEmpty />);
    expect(screen.getByText(/no runs match the current filters/i)).toBeInTheDocument();
    expect(screen.getByText('Aug 1')).toBeInTheDocument();
  });
});

describe('StatusDonutChart', () => {
  it('titles the card', () => {
    render(<StatusDonutChart data={SLICES} />);
    expect(screen.getByRole('heading', { name: /run status/i })).toBeInTheDocument();
    expect(screen.getByText(/live pipeline state/i)).toBeInTheDocument();
  });

  it('draws one arc per gateway status', () => {
    const { container } = render(<StatusDonutChart data={SLICES} />);
    expect(container.querySelectorAll('[data-testid="donut-arc"]')).toHaveLength(5);
  });

  it('lists the legend in canonical order with values', () => {
    render(<StatusDonutChart data={SLICES} />);
    const items = screen.getAllByTestId('donut-legend-item').map(el => el.textContent);
    expect(items[0]).toContain('Success');
    expect(items[1]).toContain('Running');
    expect(items[2]).toContain('Queued');
    expect(items[3]).toContain('Warnings');
    expect(items[4]).toContain('Failed');
  });

  it('shows the aggregate in the middle', () => {
    render(<StatusDonutChart data={SLICES} />);
    expect(screen.getByTestId('donut-total')).toHaveTextContent('10');
  });

  it('describes the whole breakdown for screen readers', () => {
    render(<StatusDonutChart data={SLICES} />);
    expect(screen.getByRole('img', { name: /run status/i })).toHaveAccessibleName(
      expect.stringContaining('Running'),
    );
  });

  it('survives an all zero distribution without dividing by zero', () => {
    render(<StatusDonutChart data={SLICES.map(s => ({ ...s, value: 0 }))} />);
    expect(screen.getByTestId('donut-total')).toHaveTextContent('0');
  });
});

describe('RunsByToolChart', () => {
  it('titles the card', () => {
    render(<RunsByToolChart data={TOOLS} />);
    expect(screen.getByRole('heading', { name: /runs by tool/i })).toBeInTheDocument();
    expect(screen.getByText(/tool execution service breakdown/i)).toBeInTheDocument();
  });

  it('draws one bar per registered tool', () => {
    const { container } = render(<RunsByToolChart data={TOOLS} />);
    expect(container.querySelectorAll('[data-testid="tool-bar"]')).toHaveLength(6);
  });

  it('names every tool by its operator-facing label', () => {
    render(<RunsByToolChart data={TOOLS} />);
    for (const label of ['theHarvester', 'Nmap (net-scan)', 'ffuf (fuzz-svc)']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders evenly spaced axis ticks', () => {
    render(<RunsByToolChart data={TOOLS.map(t => ({ ...t, value: 3 }))} />);
    for (const tick of ['0', '0.75', '1.5', '2.25', '3']) {
      expect(screen.getByTestId(`tool-tick-${tick}`)).toBeInTheDocument();
    }
  });

  it('describes the breakdown for screen readers', () => {
    render(<RunsByToolChart data={TOOLS} />);
    expect(screen.getByRole('img', { name: /runs by tool/i })).toHaveAccessibleName(
      expect.stringContaining('theHarvester'),
    );
  });
});
