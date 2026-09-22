import { fmtPct } from '../utils/format';

export function Sparkline({ points, width = 120, height = 36 }: { points: (number | null)[]; width?: number; height?: number }) {
  const vals = points.filter((p): p is number => p != null);
  if (vals.length < 2) return <svg width={width} height={height} aria-label="Not enough history"><line x1="0" y1={height/2} x2={width} y2={height/2} stroke="currentColor" strokeOpacity="0.3" strokeDasharray="3 3" /></svg>;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(max - min, 0.5);
  const stepX = width / (vals.length - 1);
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${(height - 4 - ((v - min) / span) * (height - 8)).toFixed(1)}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={width} height={height} role="img" aria-label={`Trend ${fmtPct(vals[vals.length-1])}`}>
      <path d={d} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="2" strokeLinejoin="round" />
    </svg>
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

export function MultiLineChart({ series, width = 820, height = 340, onSelect }: {
  series: Series[]; width?: number; height?: number; onSelect?: (id: string) => void;
}) {
  const nums = series.flatMap((s) => s.points.map((p) => p.score)).filter((v): v is number => v != null);
  const times = series.flatMap((s) => s.points.map((p) => new Date(p.t).getTime())).filter((t) => !Number.isNaN(t));
  if (nums.length < 2 || times.length < 2) {
    return <div className="empty">Not enough history yet — sync again over time to build the graph.</div>;
  }
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const tSpan = Math.max(tMax - tMin, 1);
  const min = Math.min(...nums), max = Math.max(...nums);
  const span = Math.max(max - min, 1);
  const pad = { l: 46, r: 14, t: 14, b: 28 };
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
            <text x={4} y={y(v) + 4} fontSize="11" fill="currentColor" opacity="0.7">{v.toFixed(1)}%</text>
          </g>
        );
      })}
      <text x={pad.l} y={height - 8} fontSize="11" fill="currentColor" opacity="0.6">{dayLabel(tMin)}</text>
      <text x={pad.l + iw} y={height - 8} fontSize="11" fill="currentColor" opacity="0.6" textAnchor="end">{dayLabel(tMax)}</text>
      {series.map((s) => {
        const pts = s.points.filter((p) => p.score != null);
        if (pts.length < 2) return null;
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(new Date(p.t).getTime()).toFixed(1)},${y(p.score as number).toFixed(1)}`).join(' ');
        return <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth="2.25" strokeLinejoin="round" opacity="0.92" />;
      })}
      {series.map((s) => s.points.filter((p) => p.score != null).map((p, i) => (
        <circle key={`${s.id}-${i}`} cx={x(new Date(p.t).getTime())} cy={y(p.score as number)} r="2.6"
          fill={s.color} style={{ cursor: onSelect ? 'pointer' : 'default' }}
          onClick={() => onSelect?.(s.id)}>
          <title>{`${s.name}\n${new Date(p.t).toLocaleString()} — ${(p.score as number).toFixed(2)}%`}</title>
        </circle>
      )))}
    </svg>
  );
}
