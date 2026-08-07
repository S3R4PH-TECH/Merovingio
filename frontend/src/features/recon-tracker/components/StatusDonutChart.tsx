import type { StatusSlice } from '../types';

const SIZE = 200;
const RADIUS = 78;
const THICKNESS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Drawn as a gap in the dash array — no arc maths, and no colour adjacency. */
const GAP = 2;

interface StatusDonutChartProps {
  data: StatusSlice[];
}

export function StatusDonutChart({ data }: StatusDonutChartProps) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  const description = `Run status. ${data
    .map(slice => `${slice.label}: ${slice.value}`)
    .join(', ')}.`;

  let consumed = 0;

  return (
    <section className="rt-card">
      <div className="rt-card-header">
        <div>
          <h2 className="rt-card-title">Run Status</h2>
          <p className="rt-card-subtitle">Live pipeline state</p>
        </div>
      </div>

      <figure className="rt-figure" role="img" aria-label={description}>
        <div className="rt-donut-wrap">
          <svg
            className="rt-chart-svg"
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            style={{ maxWidth: SIZE }}
            aria-hidden="true"
            focusable="false"
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="var(--rt-chart-track)"
              strokeWidth={THICKNESS}
            />

            {data.map(slice => {
              // With no data every arc is zero length; the track circle above is
              // what the user sees, and nothing divides by zero.
              const fraction = total > 0 ? slice.value / total : 0;
              const length = Math.max(0, fraction * CIRCUMFERENCE - GAP);
              const offset = -consumed * CIRCUMFERENCE;
              consumed += fraction;

              return (
                <circle
                  key={slice.status}
                  data-testid="donut-arc"
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={THICKNESS}
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                  strokeDashoffset={offset}
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                />
              );
            })}
          </svg>

          <div className="rt-donut-center">
            <span className="rt-donut-total" data-testid="donut-total">
              {total}
            </span>
            <span className="rt-donut-total-label">Total</span>
          </div>
        </div>
      </figure>

      <ul className="rt-legend">
        {data.map(slice => (
          <li className="rt-legend-item" data-testid="donut-legend-item" key={slice.status}>
            <span
              className="rt-legend-dot"
              style={{ background: slice.color }}
              aria-hidden="true"
            />
            {slice.label}
            <span className="rt-legend-value">{slice.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
