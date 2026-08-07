import { Play } from 'lucide-react';
import { Dropdown } from './Dropdown';
import { PeriodTabs } from './PeriodTabs';
import {
  STATUS_LABELS,
  STATUS_ORDER,
  TOOLS,
  TOOL_LABELS,
  type DashboardFilters,
  type RunStatus,
  type ToolName,
} from '../types';

const TOOL_OPTIONS = [
  { value: 'all' as const, label: 'All Tools' },
  ...TOOLS.map(tool => ({ value: tool, label: TOOL_LABELS[tool] })),
];

const STATUS_OPTIONS = [
  { value: 'all' as const, label: 'All Statuses' },
  ...STATUS_ORDER.map(status => ({ value: status, label: STATUS_LABELS[status] })),
];

interface FilterBarProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  onNewRun: () => void;
}

export function FilterBar({ filters, onFiltersChange, onNewRun }: FilterBarProps) {
  const toolLabel = filters.tool === 'all' ? 'All Tools' : TOOL_LABELS[filters.tool];
  const statusLabel =
    filters.status === 'all' ? 'All Statuses' : STATUS_LABELS[filters.status];

  return (
    <div className="rt-filter-bar">
      <PeriodTabs
        value={filters.period}
        onChange={period => onFiltersChange({ ...filters, period })}
      />

      <Dropdown
        triggerLabel={toolLabel}
        options={TOOL_OPTIONS}
        value={filters.tool}
        onChange={tool => onFiltersChange({ ...filters, tool: tool as ToolName | 'all' })}
      />

      <Dropdown
        triggerLabel={statusLabel}
        options={STATUS_OPTIONS}
        value={filters.status}
        onChange={status =>
          onFiltersChange({ ...filters, status: status as RunStatus | 'all' })
        }
      />

      <span className="rt-filter-spacer" />

      <button type="button" className="rt-btn-primary" onClick={onNewRun}>
        <Play size={15} aria-hidden="true" />
        New Run
      </button>
    </div>
  );
}
