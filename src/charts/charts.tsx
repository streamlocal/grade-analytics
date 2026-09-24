import { fmtPct } from '../utils/format';

export function Sparkline({ points }: { points: (number | null)[] }) {
  const vals = points.filter((p): p is number => p != null);
  if (!vals.length) return <div className="course-chart-empty">No grade history yet. Sync again to start a trend.</div>;
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  const spread = rawMax - rawMin;
  const step = spread < 10 ? 2 : spread < 25 ? 5 : 10;
  const min = Math.max(0, Math.floor((rawMin - step) / step) * step);
  const max = Math.ceil((rawMax + step) / step) * step;
  const chartSpan = Math.max(max - min, step);
  const width = 260, height = 98;
  const left = 39, right = 250, top = 9, bottom = 73;
  const y = (value: number) => bottom - ((value - min) / chartSpan) * (bottom - top);
  const x = (index: number) => left + (index / Math.max(vals.length - 1, 1)) * (right - left);
  const d = vals.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const movement = vals[vals.length - 1] - vals[0];
  const lineColor = Math.abs(movement) < 0.05 ? 'var(--muted)' : movement > 0 ? 'var(--up)' : 'var(--down)';
  const ticks = [max, (max + min) / 2, min];
  return (
    <div className="course-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={vals.length === 1
        ? `One Canvas grade snapshot at ${fmtPct(vals[0])}`
        : `Canvas grade trend from ${fmtPct(vals[0])} to ${fmtPct(vals[vals.length - 1])}`}>
        {ticks.map((tick) => <g key={tick}>
          <text x="0" y={y(tick) + 3} className="course-chart-tick">{Number.isInteger(tick) ? tick : tick.toFixed(1)}%</text>
          <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="course-chart-gridline" />
        </g>)}
        {vals.length >= 2 && <path d={d} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {vals.length >= 2 && <circle cx={x(0)} cy={y(vals[0])} r="3.5" fill={lineColor} />}
        <circle cx={vals.length === 1 ? right : x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="4" fill={lineColor} stroke="var(--card)" strokeWidth="1.5" />
        <text x={left} y="92" className="course-chart-axis">Earlier</text>
        <text x={right} y="92" textAnchor="end" className="course-chart-axis">Latest</text>
      </svg>
      <div className="course-chart-values">
        {vals.length >= 2 ? <span>Started <strong>{fmtPct(vals[0])}</strong></span> : <span>One snapshot so far</span>}
        <span>Latest Canvas <strong>{fmtPct(vals[vals.length - 1])}</strong></span>
      </div>
    </div>
  );
}

export function HistoryChart({ points, width = 640, height = 220 }: {
  points: { t: string; score: number | null; label?: string }[]; width?: number; height?: number;
}) {
  const vals = points.map((p) => p.score);
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length < 2) return <div className="empty">Not enough history yet — sync again after grades change.</div>;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(max - min, 1);
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const stepX = iw / Math.max(points.length - 1, 1);
  const y = (v: number) => pad.t + ih - ((v - min) / span) * ih;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(pad.l + i * stepX).toFixed(1)},${p.score == null ? y(nums[0]) : y(p.score).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="history-chart" role="img" aria-label="Grade history">
      {[0, 0.5, 1].map((f) => {
        const v = max - f * span;
        return (
          <g key={f}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity="0.12" />
            <text x={4} y={y(v) + 4} fontSize="11" fill="currentColor" opacity="0.7">{v.toFixed(1)}%</text>
          </g>
        );
      })}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => p.score == null ? null : (
        <circle key={i} cx={pad.l + i * stepX} cy={y(p.score)} r="3" fill="var(--accent)">
          <title>{`${new Date(p.t).toLocaleDateString()} — ${p.score.toFixed(1)}%${p.label ? ' — ' + p.label : ''}`}</title>
        </circle>
      ))}
    </svg>
  );
}

// Distinct, colorblind-friendly-ish palette for multi-course charts.
export const SERIES_COLORS = [
  '#5b8cff', '#34d399', '#f59e0b', '#f472b6', '#22d3ee',
  '#a78bfa', '#fb7185', '#84cc16', '#f97316', '#14b8a6',
  '#eab308', '#818cf8',
];

export interface Series {
  id: string;
  name: string;
  color: string;
  points: { t: string; score: number | null }[];
}

// Daily lines stay useful over a semester, but a marker for every unchanged
// day turns a calm grade history into visual noise. Keep every point in the
// line; on long ranges only mark the endpoints, changes, and weekly waypoints.
function isVisibleMarker(points: { t: string; score: number | null }[], index: number): boolean {
  if (points.length <= 45 || index === 0 || index === points.length - 1) return true;
  const score = points[index].score;
  const previous = points[index - 1]?.score;
  if (score != null && previous != null && Math.abs(score - previous) >= 0.01) return true;
  const start = new Date(points[0].t).getTime();
  const before = new Date(points[index - 1].t).getTime();
  const current = new Date(points[index].t).getTime();
  return Math.floor((current - start) / 604_800_000) > Math.floor((before - start) / 604_800_000);
}

export function MultiLineChart({ series, width = 820, height = 340, onSelect, unit = '%' }: {
  series: Series[]; width?: number; height?: number; onSelect?: (id: string) => void; unit?: string;
}) {
  const nums = series.flatMap((s) => s.points.map((p) => p.score)).filter((v): v is number => v != null);
  const times = series.flatMap((s) => s.points.map((p) => new Date(p.t).getTime())).filter((t) => !Number.isNaN(t));
  if (nums.length < 2 || times.length < 2) {
    return <div className="empty">Not enough history yet — sync again over time to build the graph.</div>;
  }
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const tSpan = Math.max(tMax - tMin, 1);
  const rawMin = Math.min(...nums), rawMax = Math.max(...nums);
  const isGpa = unit === '';
  const minSpan = isGpa ? 0.1 : 1;
  const padding = Math.max((rawMax - rawMin) * 0.12, isGpa ? 0.015 : 0.2);
  const middle = (rawMin + rawMax) / 2;
  const span = Math.max(rawMax - rawMin + padding * 2, minSpan);
  const min = middle - span / 2, max = middle + span / 2;
  const pad = { l: isGpa ? 54 : 46, r: 14, t: 14, b: 28 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (t: number) => pad.l + ((t - tMin) / tSpan) * iw;
  const y = (v: number) => pad.t + ih - ((v - min) / span) * ih;
  const dayLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="history-chart" role="img" aria-label="Grade history by course">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const v = max - f * span;
        return (
          <g key={f}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity="0.1" />
            <text x={4} y={y(v) + 4} fontSize="11" fill="currentColor" opacity="0.7">{v.toFixed(isGpa ? 3 : 1)}{unit}</text>
          </g>
        );
      })}
      <text x={pad.l} y={height - 8} fontSize="11" fill="currentColor" opacity="0.6">{dayLabel(tMin)}</text>
      <text x={pad.l + iw} y={height - 8} fontSize="11" fill="currentColor" opacity="0.6" textAnchor="end">{dayLabel(tMax)}</text>
      {series.map((s) => {
        const pts = s.points.filter((p) => p.score != null);
        if (pts.length < 2) return null;
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(new Date(p.t).getTime()).toFixed(1)},${y(p.score as number).toFixed(1)}`).join(' ');
        return <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.94" />;
      })}
      {series.map((s) => {
        const points = s.points.filter((p) => p.score != null);
        return points.map((p, i) => !isVisibleMarker(points, i) ? null : (
        <circle key={`${s.id}-${i}`} cx={x(new Date(p.t).getTime())} cy={y(p.score as number)} r="2.6"
          fill={s.color} style={{ cursor: onSelect ? 'pointer' : 'default' }}
          onClick={() => onSelect?.(s.id)}>
          <title>{`${s.name}\n${new Date(p.t).toLocaleString()} — ${(p.score as number).toFixed(2)}${unit}`}</title>
        </circle>
        ));
      })}
    </svg>
  );
}
