import { useId } from 'react';
import { TrendingUp } from 'lucide-react';
import type { VolumePoint } from '../types';

const WIDTH = 900;
const HEIGHT = 210;
const AXIS_H = 26;
const GRID_LINES = 4;
/** Above this many points the axis is thinned so labels stop colliding. */
const MAX_LABELS = 10;

interface RunVolumeChartProps {
  data: VolumePoint[];
  periodLabel: string;
  trendPercent: number;
  isEmpty?: boolean;
}

export function RunVolumeChart({
  data,
  periodLabel,
  trendPercent,
  isEmpty = false,
}: RunVolumeChartProps) {
  const gradientId = useId();

  // A max of zero would divide by zero; falling back to 1 draws the frame with
  // flat bars, which is what the empty state should look like.
  const max = Math.max(1, ...data.map(point => point.count));
  const step = WIDTH / Math.max(data.length, 1);
  const barWidth = step * 0.62;
  const plotH = HEIGHT - AXIS_H;
  const labelEvery = Math.ceil(data.length / MAX_LABELS);

  const description = `Run volume, ${periodLabel}. ${data
    .map(point => `${point.label}: ${point.count}`)
    .join(', ')}.`;

  return (
    <section className="rt-card rt-chart-card">
      <div className="rt-card-header">
        <div>
          <h2 className="rt-card-title">Run Volume</h2>
          <p className="rt-card-subtitle">{periodLabel}</p>
        </div>
        <span className="rt-badge">
          <TrendingUp size={12} aria-hidden="true" />
          {trendPercent}%
        </span>
      </div>

      <figure className="rt-figure" role="img" aria-label={description}>
        <svg
          className="rt-chart-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--rt-chart-from)" />
              <stop offset="100%" stopColor="var(--rt-chart-to)" />
            </linearGradient>
          </defs>

          {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
            const y = (plotH / GRID_LINES) * i;
            return (
              <line
                key={i}
                x1={0}
                y1={y}
                x2={WIDTH}
                y2={y}
                stroke="var(--rt-chart-grid)"
                strokeWidth={1}
              />
            );
          })}

          {data.map((point, index) => {
            const height = (point.count / max) * (plotH - 8);
            return (
              <rect
                key={point.date}
                className="rt-bar"
                data-testid="volume-bar"
                x={index * step + (step - barWidth) / 2}
                y={plotH - height}
                width={barWidth}
                height={height}
                rx={4}
                fill={`url(#${gradientId})`}
              />
            );
          })}

          {/*
            Labels live inside the SVG so they land exactly on their bar's centre
            line. A long window is thinned rather than crushed.
          */}
          {data.map((point, index) =>
            index % labelEvery === 0 ? (
              <text
                key={point.date}
                className="rt-axis-label"
                x={index * step + step / 2}
                y={HEIGHT - 6}
                textAnchor="middle"
              >
                {point.label}
              </text>
            ) : null,
          )}
        </svg>

        {isEmpty && <p className="rt-empty-note">No runs match the current filters</p>}
      </figure>
    </section>
  );
}
