import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useCourses } from '../hooks/useData';
import { Card, Empty, Skeleton } from '../components/ui';
import { MultiLineChart, SERIES_COLORS, type Series } from '../charts/charts';
import { effectiveScore, overallGpa, type CourseLevel } from '../utils/gpa';
import type { CourseSnapshot } from '../models/types';

type Range = '7D' | '30D' | 'Q' | 'S' | 'ALL';

export default function History() {
  const { courses, loading } = useCourses();
  const navigate = useNavigate();
  const [snaps, setSnaps] = useState<CourseSnapshot[]>([]);
  const [range, setRange] = useState<Range>('30D');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'classes' | 'gpa'>('classes');

  useEffect(() => {
    const ids = courses.filter((c) => c.tracked).map((c) => c.id);
    if (!ids.length) return;
    supabase.from('course_snapshots').select('*').in('course_id', ids).order('created_at')
      .then(({ data }) => setSnaps((data ?? []) as CourseSnapshot[]));
  }, [courses]);

  const tracked = courses.filter((c) => c.tracked);
  const days = range === '7D' ? 7 : range === '30D' ? 30 : range === 'Q' ? 90 : range === 'S' ? 180 : 100000;
  const cutoff = Date.now() - days * 86400_000;

  const series: Series[] = useMemo(() => tracked.map((c, i) => ({
    id: c.id,
    name: c.name,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    points: snaps
      .filter((s) => s.course_id === c.id && new Date(s.created_at).getTime() >= cutoff)
      .map((s) => ({ t: s.created_at, score: s.score })),
  })), [tracked, snaps, cutoff]);

  // Total GPA over time: for each snapshot time, take each course's most recent
  // snapshot up to that time and average the Ignatius quality points.
  const gpaSeries = useMemo(() => {
    const times = [...new Set(snaps.map((s) => s.created_at))].sort();
    const byCourse: Record<string, CourseSnapshot[]> = {};
    for (const s of snaps) (byCourse[s.course_id] ??= []).push(s);
    for (const k in byCourse) byCourse[k].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return times.map((t) => {
      const classes = tracked.map((c) => {
        const upto = (byCourse[c.id] ?? []).filter((s) => s.created_at <= t);
        const latest = upto.length ? upto[upto.length - 1] : null;
        return { score: latest?.score ?? null, level: (c.level ?? 'Regular') as CourseLevel };
      });
      return { t, score: overallGpa(classes) };
    }).filter((p): p is { t: string; score: number } => p.score != null);
  }, [snaps, tracked]);

  const visible = series.filter((s) => !hidden.has(s.id));
  const rangeGpa = gpaSeries.filter((p) => new Date(p.t).getTime() >= cutoff);
  const currentGpa = overallGpa(tracked.map((c) => ({ score: effectiveScore(c), level: c.level ?? 'Regular' })));

  if (loading) return <main><Skeleton lines={6} /></main>;
  if (!tracked.length) return <main><Empty title="No tracked courses yet" hint="Connect Canvas in Settings and run a sync." /></main>;

  return (
    <main>
      <h2>Grade History</h2>
      <Card>
        <div className="toolbar">
          <label className="row" style={{ flexDirection: 'row' }}>
            <input type="radio" name="hmode" checked={mode === 'classes'} onChange={() => setMode('classes')} />
            All classes
          </label>
          <label className="row" style={{ flexDirection: 'row' }}>
            <input type="radio" name="hmode" checked={mode === 'gpa'} onChange={() => setMode('gpa')} />
            Total GPA
          </label>
          <span style={{ width: 12 }} />
          {(['7D', '30D', 'Q', 'S', 'ALL'] as const).map((r) => (
            <button key={r} className={`btn ${range === r ? 'primary' : ''}`} onClick={() => setRange(r)}>
              {r === 'Q' ? 'Quarter' : r === 'S' ? 'Semester' : r}
            </button>
          ))}
        </div>

        {mode === 'gpa' ? (
          <>
            <p className="muted">Current GPA (Ignatius scale): <strong>{currentGpa == null ? '—' : currentGpa.toFixed(2)}</strong></p>
            <MultiLineChart unit="" series={[{ id: '__gpa__', name: 'Total GPA', color: '#5b8cff', points: rangeGpa }]} />
            <p className="muted" style={{ fontSize: 12 }}>
              GPA uses Canvas snapshot grades with your per-course Honors/AP weights; Free periods excluded.
              Set weights on the Compare tab.
            </p>
          </>
        ) : (
          <>
            <MultiLineChart series={visible} onSelect={(id) => navigate(`/course/${id}`)} />
            <div className="row" style={{ marginTop: 12 }}>
              {series.map((s) => {
                const off = hidden.has(s.id);
                return (
                  <button key={s.id} className="btn ghost" style={{ opacity: off ? 0.4 : 1 }}
                    onClick={() => {
                      const n = new Set(hidden);
                      if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                      setHidden(n);
                    }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: s.color, marginRight: 6 }} />
                    {s.name}
                  </button>
                );
              })}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Hover any point for the exact grade and timestamp. Click a point or a legend chip to open that course.
              Each point is one saved snapshot; more points appear as daily syncs accumulate.
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
