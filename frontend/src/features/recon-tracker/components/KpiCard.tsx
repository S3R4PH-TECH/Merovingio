import { useId } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type KpiVariant = 'neutral' | 'warning' | 'positive' | 'negative';

interface KpiCardProps {
  label: string;
  value: number;
  caption: string;
  icon: LucideIcon;
  variant?: KpiVariant;
  /** Renders the warning triangle and the amber tone on the caption. */
  captionTone?: 'neutral' | 'warning' | 'positive';
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  caption,
  icon: Icon,
  variant = 'neutral',
  captionTone = 'neutral',
  loading = false,
}: KpiCardProps) {
  const labelId = useId();

  return (
    <article
      className="rt-card rt-kpi"
      aria-labelledby={labelId}
      data-variant={variant}
      aria-busy={loading || undefined}
    >
      <div className="rt-kpi-top">
        <h2 className="rt-kpi-label" id={labelId}>
          {label}
        </h2>
        <span className="rt-kpi-icon">
          <Icon size={17} aria-hidden="true" />
        </span>
      </div>

      {loading ? (
        <>
          <span className="rt-skeleton rt-skeleton-value" />
          <span className="rt-skeleton rt-skeleton-caption" />
        </>
      ) : (
        <>
          {/*
            aria-live announces the recalculated figure when a filter changes,
            without stealing focus from the control the user just operated.
          */}
          <span className="rt-kpi-value" data-testid="kpi-value" aria-live="polite">
            {value}
          </span>
          <p className="rt-kpi-caption" data-tone={captionTone}>
            {captionTone === 'warning' && <TriangleAlert size={13} aria-hidden="true" />}
            {caption}
          </p>
        </>
      )}
    </article>
  );
}
