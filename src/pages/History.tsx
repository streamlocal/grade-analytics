import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { fetchSnapshotsForCourses, useCourses } from '../hooks/useData';
import { Card, Empty, Skeleton } from '../components/ui';
import { MultiLineChart, SERIES_COLORS, type Series } from '../charts/charts';
import { effectiveScore, overallGpa } from '../utils/gpa';
import { buildGpaTimeline, latestSnapshotsPerDay } from '../utils/history';
import type { CourseSnapshot, SyncRun } from '../models/types';

type Range = '7D' | '30D' | 'Q' | 'S' | 'ALL';

export default function History() {
  const { courses, loading } = useCourses();
  const navigate = useNavigate();
  const [snaps, setSnaps] = useState<CourseSnapshot[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [range, setRange] = useState<Range>('30D');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'classes' | 'gpa'>('classes');

  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1);
    window.addEventListener('ga-sync-complete', reload);
    return () => window.removeEventListener('ga-sync-complete', reload);
  }, []);

  useEffect(() => {
    const ids = courses.filter((c) => c.tracked).map((c) => c.id);
    let cancelled = false;
    if (!ids.length) { setSnaps([]); setRuns([]); return; }
    async function load() {
      const snapshots = await fetchSnapshotsForCourses(ids);
      const completed: SyncRun[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('sync_runs').select('*').eq('status', 'complete')
          .order('finished_at').range(offset, offset + pageSize - 1);
        if (error) throw error;
        completed.push(...((data ?? []) as SyncRun[]));
        if (!data || data.length < pageSize) break;
      }
      if (!cancelled) { setSnaps(snapshots); setRuns(completed); }
    }
    void load().catch(() => { if (!cancelled) { setSnaps([]); setRuns([]); } });
    return () => { cancelled = true; };
  }, [courses, refresh]);

  const tracked = courses.filter((c) => c.tracked);
  const days = range === '7D' ? 7 : range === '30D' ? 30 : range === 'Q' ? 90 : range === 'S' ? 180 : 100000;
  const cutoff = Date.now() - days * 86400_000;

  const dailySnapshots = useMemo(() => latestSnapshotsPerDay(snaps), [snaps]);
  const series: Series[] = useMemo(() => tracked.map((c, i) => ({
    id: c.id,
    name: c.name,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    points: dailySnapshots
      .filter((s) => s.course_id === c.id && new Date(s.created_at).getTime() >= cutoff)
      .map((s) => ({ t: s.created_at, score: s.score })),
  })), [tracked, dailySnapshots, cutoff]);

  const gpaSeries = useMemo(() => buildGpaTimeline(tracked, snaps, runs), [snaps, runs, courses]);

  const visible = series.filter((s) => !hidden.has(s.id));
  const inRangeGpa = gpaSeries.filter((point) => new Date(point.t).getTime() >= cutoff);
  const olderGpa = gpaSeries.filter((point) => new Date(point.t).getTime() < cutoff);
  const beforeRangeGpa = olderGpa[olderGpa.length - 1];
  const rangeGpa = beforeRangeGpa && inRangeGpa.length && range !== 'ALL'
    ? [{ t: new Date(cutoff).toISOString(), score: beforeRangeGpa.score }, ...inRangeGpa]
    : inRangeGpa;
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
            <p className="muted">Current GPA (Ignatius scale): <strong>{currentGpa == null ? '—' : currentGpa.toFixed(3)}</strong></p>
            <MultiLineChart unit="" series={[{ id: '__gpa__', name: 'Total GPA', color: '#5b8cff', points: rangeGpa }]} />
            <p className="muted" style={{ fontSize: 12 }}>
              GPA uses Canvas snapshot grades rounded to whole percentages (.5 up), with your per-course Honors/AP weights; Free periods excluded.
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
              Hover a marker for the final saved grade and timestamp for that day. Click a marker or a legend chip to open that course.
              One point is shown per class per day; longer views mark weekly checkpoints and grade changes so the graph stays readable.
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
