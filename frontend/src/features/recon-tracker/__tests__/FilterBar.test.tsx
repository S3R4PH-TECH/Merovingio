import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '../components/FilterBar';
import type { DashboardFilters } from '../types';

const FILTERS: DashboardFilters = { period: '7d', tool: 'all', status: 'all', program: 'all' };

function renderBar(overrides: Partial<DashboardFilters> = {}) {
  const onFiltersChange = vi.fn();
  const onNewRun = vi.fn();
  const utils = render(
    <FilterBar
      filters={{ ...FILTERS, ...overrides }}
      onFiltersChange={onFiltersChange}
      onNewRun={onNewRun}
    />,
  );
  return { onFiltersChange, onNewRun, ...utils };
}

describe('FilterBar period tabs', () => {
  it('exposes a labelled tablist', () => {
    renderBar();
    expect(screen.getByRole('tablist', { name: /time period/i })).toBeInTheDocument();
  });

  it('renders the three periods', () => {
    renderBar();
    for (const name of [/last 24 hours/i, /last 7 days/i, /last 30 days/i]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
  });

  it('selects 7 days by default', () => {
    renderBar();
    expect(screen.getByRole('tab', { name: /last 7 days/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /last 24 hours/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('keeps only the selected tab in the tab order', () => {
    renderBar();
    expect(screen.getByRole('tab', { name: /last 7 days/i })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /last 30 days/i })).toHaveAttribute('tabindex', '-1');
  });

  it('reports a period change on click', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderBar();
    await user.click(screen.getByRole('tab', { name: /last 24 hours/i }));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ period: '24h' }));
  });

  it('moves to the next tab with the right arrow', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderBar();
    screen.getByRole('tab', { name: /last 7 days/i }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ period: '30d' }));
  });

  it('moves to the previous tab with the left arrow', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderBar();
    screen.getByRole('tab', { name: /last 7 days/i }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ period: '24h' }));
  });

  it('jumps to the first and last tabs with Home and End', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderBar();
    screen.getByRole('tab', { name: /last 7 days/i }).focus();

    await user.keyboard('{Home}');
    expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ period: '24h' }));

    await user.keyboard('{End}');
    expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ period: '30d' }));
  });
});

describe('FilterBar dropdowns', () => {
  it('defaults both dropdowns to the all option', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /all tools/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all statuses/i })).toBeInTheDocument();
  });

  it('lists every TES tool plus the all option', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole('button', { name: /all tools/i }));

    for (const name of [
      'All Tools',
      'theHarvester',
      'Nmap (net-scan)',
      'ffuf (fuzz-svc)',
    ]) {
      expect(screen.getByRole('option', { name })).toBeInTheDocument();
    }
  });

  it('reports a tool change', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderBar();
    await user.click(screen.getByRole('button', { name: /all tools/i }));
    await user.click(screen.getByRole('option', { name: 'Nmap (net-scan)' }));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'net-scan' }),
    );
  });

  it('reports a status change using the domain value, not the label', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderBar();
    await user.click(screen.getByRole('button', { name: /all statuses/i }));
    await user.click(screen.getByRole('option', { name: 'Warnings' }));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed_with_warnings' }),
    );
  });

  it('reflects an active tool filter on the trigger', () => {
    renderBar({ tool: 'net-scan' });
    expect(screen.getByRole('button', { name: /nmap/i })).toBeInTheDocument();
  });
});

describe('FilterBar primary action', () => {
  it('renders the new run button', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /new run/i })).toBeInTheDocument();
  });

  it('calls back on click', async () => {
    const user = userEvent.setup();
    const { onNewRun } = renderBar();
    await user.click(screen.getByRole('button', { name: /new run/i }));
    expect(onNewRun).toHaveBeenCalledOnce();
  });
});
