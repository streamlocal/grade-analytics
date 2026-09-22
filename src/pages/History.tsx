import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useCourses } from '../hooks/useData';
import { Card, Empty, Skeleton } from '../components/ui';
import { MultiLineChart, SERIES_COLORS, type Series } from '../charts/charts';
import type { CourseSnapshot } from '../models/types';

type Range = '7D' | '30D' | 'Q' | 'S' | 'ALL';

export default function History() {
  const { courses, loading } = useCourses();
  const navigate = useNavigate();
  const [snaps, setSnaps] = useState<CourseSnapshot[]>([]);
  const [range, setRange] = useState<Range>('30D');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

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

  const visible = series.filter((s) => !hidden.has(s.id));

  if (loading) return <main><Skeleton lines={6} /></main>;
  if (!tracked.length) return <main><Empty title="No tracked courses yet" hint="Connect Canvas in Settings and run a sync." /></main>;

  return (
    <main>
      <h2>Grade History</h2>
      <Card>
        <div className="toolbar">
          {(['7D', '30D', 'Q', 'S', 'ALL'] as const).map((r) => (
            <button key={r} className={`btn ${range === r ? 'primary' : ''}`} onClick={() => setRange(r)}>
              {r === 'Q' ? 'Quarter' : r === 'S' ? 'Semester' : r}
            </button>
          ))}
        </div>
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
      </Card>
    </main>
  );
}
