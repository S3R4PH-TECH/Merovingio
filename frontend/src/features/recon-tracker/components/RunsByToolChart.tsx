import { useId } from 'react';
import { formatTick, selectAxisTicks } from '../lib/selectors';
import { TOOL_LABELS, type ToolBar } from '../types';

const TRACK_H = 22;

interface RunsByToolChartProps {
  data: ToolBar[];
}

export function RunsByToolChart({ data }: RunsByToolChartProps) {
  const gradientId = useId();

  const ticks = selectAxisTicks(Math.max(0, ...data.map(bar => bar.value)));
  const axisMax = ticks[ticks.length - 1] || 1;

  const description = `Runs by tool. ${data
    .map(bar => `${TOOL_LABELS[bar.tool]}: ${bar.value}`)
    .join(', ')}.`;

  return (
    <section className="rt-card">
      <div className="rt-card-header">
        <div>
          <h2 className="rt-card-title">Runs by Tool</h2>
          <p className="rt-card-subtitle">Tool Execution Service breakdown</p>
        </div>
      </div>

      <figure className="rt-figure" role="img" aria-label={description}>
        <svg width="0" height="0" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--rt-chart-to)" />
              <stop offset="100%" stopColor="var(--rt-chart-from)" />
            </linearGradient>
          </defs>
        </svg>

        {data.map(bar => (
          <div className="rt-type-row" key={bar.tool}>
            <div className="rt-type-head">
              <span className="rt-type-name">{TOOL_LABELS[bar.tool]}</span>
              <span className="rt-type-value">{bar.value}</span>
            </div>
            <svg
              className="rt-chart-svg"
              viewBox={`0 0 100 ${TRACK_H}`}
              preserveAspectRatio="none"
              style={{ height: TRACK_H }}
              aria-hidden="true"
              focusable="false"
            >
              <rect x={0} y={0} width={100} height={TRACK_H} rx={4} fill="var(--rt-chart-track)" />
              <rect
                className="rt-bar-h"
                data-testid="tool-bar"
                x={0}
                y={0}
                width={(bar.value / axisMax) * 100}
                height={TRACK_H}
                rx={4}
                fill={`url(#${gradientId})`}
              />
            </svg>
          </div>
        ))}

        <div className="rt-type-ticks">
          {ticks.map(tick => (
            <span key={tick} data-testid={`tool-tick-${formatTick(tick)}`}>
              {formatTick(tick)}
            </span>
          ))}
        </div>
      </figure>
    </section>
  );
}
