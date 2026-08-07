import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { KpiCard } from '../components/KpiCard';

describe('KpiCard', () => {
  it('pairs its heading with the article via aria-labelledby', () => {
    render(<KpiCard label="Total Runs" value={10} caption="Last 7 days" icon={FileText} />);
    expect(screen.getByRole('article', { name: 'Total Runs' })).toBeInTheDocument();
  });

  it('renders the metric value', () => {
    render(<KpiCard label="Total Runs" value={10} caption="Last 7 days" icon={FileText} />);
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders an explicit zero rather than an empty slot', () => {
    render(<KpiCard label="Succeeded" value={0} caption="Last 7 days" icon={FileText} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('announces value changes politely', () => {
    render(<KpiCard label="Total Runs" value={10} caption="Last 7 days" icon={FileText} />);
    expect(screen.getByText('10')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows the caption', () => {
    render(<KpiCard label="Total Runs" value={10} caption="Last 24 hours" icon={FileText} />);
    expect(screen.getByText(/last 24 hours/i)).toBeInTheDocument();
  });

  it('marks the warning variant on the element for styling hooks', () => {
    render(
      <KpiCard
        label="Active Runs"
        value={10}
        caption="In progress"
        icon={FileText}
        variant="warning"
      />,
    );
    expect(screen.getByRole('article', { name: 'Active Runs' })).toHaveAttribute(
      'data-variant',
      'warning',
    );
  });

  it('hides its decorative icon from assistive tech', () => {
    const { container } = render(
      <KpiCard label="Total Runs" value={10} caption="Last 7 days" icon={FileText} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders skeletons instead of numbers while loading', () => {
    render(
      <KpiCard label="Total Runs" value={10} caption="Last 7 days" icon={FileText} loading />,
    );
    expect(screen.queryByText('10')).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Total Runs' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});
