import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Table2, BarChart3 } from 'lucide-react';

const numberFormat = new Intl.NumberFormat('en-IN');
export const formatCount = (value: number) => numberFormat.format(value);

/** Card frame shared by every chart: title, optional subtitle, and a chart/table toggle. */
export function ChartCard({
  title,
  subtitle,
  table,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  table: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`chart-card ${wide ? 'wide' : ''}`} aria-label={title}>
      <header className="chart-card-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          type="button"
          className="chart-toggle"
          aria-pressed={showTable}
          onClick={() => setShowTable((value) => !value)}
        >
          {showTable ? <BarChart3 size={13} /> : <Table2 size={13} />}
          {showTable ? 'Chart' : 'Table'}
        </button>
      </header>
      {showTable ? <div className="chart-table-wrap">{table}</div> : children}
    </section>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <table className="chart-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{typeof cell === 'number' ? formatCount(cell) : cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
}

/**
 * Ranked horizontal bars in one hue: name, bar and figure per row (a meter list). Bars share
 * one baseline so parts compare exactly; each row is focusable and titled for hover/keyboard.
 */
export function BarList({
  rows,
  unit = '',
  emptyText = 'No data in this range.',
  max,
  showShare = true,
}: {
  rows: BarRow[];
  unit?: string;
  emptyText?: string;
  /** Scale maximum; defaults to the largest value. Use 100 for percentages. */
  max?: number;
  showShare?: boolean;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const scale = max ?? Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length || total === 0) return <p className="chart-empty">{emptyText}</p>;
  return (
    <ul className="bar-list">
      {rows.map((row) => {
        const share = total ? Math.round((row.value / total) * 100) : 0;
        const description = `${row.label}: ${formatCount(row.value)}${unit}${showShare ? ` (${share}%)` : ''}`;
        return (
          <li key={row.key} tabIndex={0} title={description} aria-label={description}>
            <span className="bar-label">{row.label}</span>
            <span className="bar-track" aria-hidden="true">
              <i style={{ width: `${(row.value / scale) * 100}%` }} />
            </span>
            <span className="bar-value">
              {formatCount(row.value)}
              {unit}
              {showShare && <small>{share}%</small>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const HEIGHT = 200;
const PAD = { top: 16, right: 40, bottom: 26, left: 34 };

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude * 4 >= value)! * magnitude;
  return step * 4;
}

const dayLabel = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const formatDay = (day: string) => dayLabel.format(new Date(`${day}T00:00:00Z`));

/**
 * Single-series trend: 2px line over a 10% area wash, hairline grid, and a crosshair that
 * snaps to the nearest day on hover or arrow keys. The last value is labelled directly.
 */
export function TrendChart({
  points,
  label,
}: {
  points: Array<{ day: string; count: number }>;
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // A callback ref (state) so the observer attaches when the chart mounts, which can be
  // after the first render if data arrives later.
  const [wrapElement, setWrapElement] = useState<HTMLDivElement | null>(null);
  // Draw at the real pixel width so text and strokes stay at their intended size.
  const [WIDTH, setWidth] = useState(640);
  useEffect(() => {
    if (!wrapElement) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(wrapElement);
    return () => observer.disconnect();
  }, [wrapElement]);
  const geometry = useMemo(() => {
    const top = niceMax(Math.max(0, ...points.map((point) => point.count)));
    const innerWidth = WIDTH - PAD.left - PAD.right;
    const innerHeight = HEIGHT - PAD.top - PAD.bottom;
    const x = (index: number) =>
      PAD.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const y = (value: number) => PAD.top + innerHeight - (value / top) * innerHeight;
    const line = points
      .map((point, index) => `${index ? 'L' : 'M'}${x(index)},${y(point.count)}`)
      .join('');
    const area = points.length ? `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : '';
    const ticks = [0, 1, 2, 3, 4].map((step) => (top / 4) * step);
    // Roughly one date label per 110px so labels never collide.
    const labelEvery = Math.max(
      1,
      Math.ceil(points.length / Math.max(2, Math.floor(innerWidth / 110))),
    );
    return { x, y, line, area, ticks, labelEvery };
  }, [points, WIDTH]);

  if (!points.length) return <p className="chart-empty">No data in this range.</p>;
  const last = points.length - 1;

  const pick = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = (clientX - box.left) / box.width;
    const svgX = ratio * WIDTH;
    let nearest = 0;
    for (let index = 1; index < points.length; index += 1)
      if (Math.abs(geometry.x(index) - svgX) < Math.abs(geometry.x(nearest) - svgX))
        nearest = index;
    setActive(nearest);
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowRight') setActive((value) => Math.min(last, (value ?? -1) + 1));
    else if (event.key === 'ArrowLeft') setActive((value) => Math.max(0, (value ?? last + 1) - 1));
    else return;
    event.preventDefault();
  };
  const current = active === null ? null : points[active]!;

  return (
    <div className="trend-chart" ref={setWrapElement}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={`${label}. Use left and right arrow keys to read each day.`}
        tabIndex={0}
        onPointerMove={(event) => pick(event.clientX)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((value) => value ?? last)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        {geometry.ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? 'trend-baseline' : 'trend-grid'}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={geometry.y(tick)}
              y2={geometry.y(tick)}
            />
            <text className="trend-tick" x={PAD.left - 8} y={geometry.y(tick) + 4} textAnchor="end">
              {formatCount(tick)}
            </text>
          </g>
        ))}
        {points.map((point, index) =>
          index % geometry.labelEvery === 0 || index === last ? (
            <text
              key={point.day}
              className="trend-tick"
              x={geometry.x(index)}
              y={HEIGHT - 6}
              textAnchor={index === 0 ? 'start' : index === last ? 'end' : 'middle'}
            >
              {formatDay(point.day)}
            </text>
          ) : null,
        )}
        <path className="trend-area" d={geometry.area} />
        <path className="trend-line" d={geometry.line} />
        <circle
          className="trend-dot"
          cx={geometry.x(last)}
          cy={geometry.y(points[last]!.count)}
          r={4}
        />
        <text
          className="trend-end-label"
          x={geometry.x(last) + 8}
          y={geometry.y(points[last]!.count) + 4}
        >
          {formatCount(points[last]!.count)}
        </text>
        {current && active !== null && (
          <g>
            <line
              className="trend-crosshair"
              x1={geometry.x(active)}
              x2={geometry.x(active)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
            />
            <circle
              className="trend-dot"
              cx={geometry.x(active)}
              cy={geometry.y(current.count)}
              r={4}
            />
          </g>
        )}
      </svg>
      {current && active !== null && (
        <div
          className="trend-tooltip"
          role="status"
          // Keep the tooltip inside the card: anchor it left or right near the edges.
          style={{
            left: `${geometry.x(active)}px`,
            transform:
              geometry.x(active) > WIDTH - 140
                ? 'translateX(-100%)'
                : geometry.x(active) < 140
                  ? 'none'
                  : 'translateX(-50%)',
          }}
        >
          <strong>{formatCount(current.count)}</strong>
          <span>
            <i /> {label} · {formatDay(current.day)}
          </span>
        </div>
      )}
    </div>
  );
}
