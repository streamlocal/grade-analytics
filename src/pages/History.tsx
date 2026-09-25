import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { fetchSnapshotsForCourses, useCourses } from '../hooks/useData';
import { Card, Empty, Skeleton } from '../components/ui';
import { GpaTrendChart, MultiLineChart, SERIES_COLORS, type Series } from '../charts/charts';
import { overallGpa } from '../utils/gpa';
import { buildGpaHistory, collapseUnchangedPoints, collapseUnchangedSnapshots } from '../utils/history';
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
  const [gpaView, setGpaView] = useState<'trend' | 'byClass'>('trend');

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

  const displaySnapshots = useMemo(() => collapseUnchangedSnapshots(snaps), [snaps]);
  const series: Series[] = useMemo(() => tracked.map((c, i) => ({
    id: c.id,
    name: c.name,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    points: displaySnapshots
      .filter((s) => s.course_id === c.id && new Date(s.created_at).getTime() >= cutoff)
      .map((s) => ({ t: s.created_at, score: s.score })),
  })), [tracked, displaySnapshots, cutoff]);

  const gpaHistory = useMemo(() => buildGpaHistory(tracked, snaps, runs), [snaps, runs, courses]);
  const gpaSeries = useMemo(() => collapseUnchangedPoints(gpaHistory), [gpaHistory]);

  const visible = series.filter((s) => !hidden.has(s.id));
  const inRangeGpa = gpaSeries.filter((point) => new Date(point.t).getTime() >= cutoff);
  const olderGpa = gpaSeries.filter((point) => new Date(point.t).getTime() < cutoff);
  const beforeRangeGpa = olderGpa[olderGpa.length - 1];
  const rangeGpa = beforeRangeGpa && inRangeGpa.length && range !== 'ALL'
    ? [{ t: new Date(cutoff).toISOString(), score: beforeRangeGpa.score }, ...inRangeGpa]
    : inRangeGpa;
  const historicalInRange = gpaHistory.filter((point) => Date.parse(point.t) >= cutoff);
  const earlierHistory = gpaHistory.filter((point) => Date.parse(point.t) < cutoff);
  const historicalBeforeRange = earlierHistory[earlierHistory.length - 1];
  const impactStart = historicalBeforeRange && historicalInRange.length && range !== 'ALL'
    ? historicalBeforeRange : historicalInRange[0];
  const impactEnd = historicalInRange[historicalInRange.length - 1];
  const impactRows = impactStart && impactEnd ? tracked.map((course, index) => ({
    id: course.id,
    name: course.name,
    color: SERIES_COLORS[index % SERIES_COLORS.length],
    change: (impactEnd.shares[course.id] ?? 0) - (impactStart.shares[course.id] ?? 0),
  })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)) : [];
  const largestImpact = Math.max(...impactRows.map((row) => Math.abs(row.change)), 0.001);
  const currentGpa = overallGpa(tracked.map((c) => ({ score: c.current_score, level: c.level ?? 'Regular' })));

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
          {mode === 'gpa' && <div className="history-view-switch" role="group" aria-label="GPA graph view">
            <button type="button" aria-pressed={gpaView === 'trend'} onClick={() => setGpaView('trend')}>Trend</button>
            <button type="button" aria-pressed={gpaView === 'byClass'} onClick={() => setGpaView('byClass')}>By class</button>
          </div>}
        </div>

        {mode === 'gpa' ? (
          <>
            <div className="gpa-history-summary">
              <div><span className="muted">Current GPA · Ignatius scale</span><strong>{currentGpa == null ? '—' : currentGpa.toFixed(3)}</strong></div>
              {impactStart && impactEnd && <div><span className="muted">Change in selected period</span>
                <strong className={impactEnd.score === impactStart.score ? 'muted' : impactEnd.score > impactStart.score ? 'up' : 'down'}>
                  {impactEnd.score > impactStart.score ? '+' : ''}{(impactEnd.score - impactStart.score).toFixed(3)}
                </strong></div>}
            </div>
            {gpaView === 'trend' ? <GpaTrendChart points={rangeGpa} /> : (
              <div className="gpa-impact-view">
                <h3>What moved your GPA</h3>
                <p className="muted">Each bar shows a class’s contribution to your GPA change in this period.</p>
                {impactStart && impactEnd && impactStart.t !== impactEnd.t ? impactRows.map((row) => (
                  <div className="gpa-impact-row" key={row.id}>
                    <span className="gpa-impact-name">{row.name}</span>
                    <div className="gpa-impact-track" role="img" aria-label={`${row.name}: ${row.change > 0 ? '+' : ''}${row.change.toFixed(3)} GPA`}>
                      <span className="gpa-impact-midline" />
                      {Math.abs(row.change) >= 0.0005 && <span className="gpa-impact-bar" style={{
                        background: row.color,
                        width: `${Math.max(2, Math.abs(row.change) / largestImpact * 47)}%`,
                        left: row.change < 0 ? `${50 - Math.max(2, Math.abs(row.change) / largestImpact * 47)}%` : '50%',
                      }} />}
                    </div>
                    <strong className={Math.abs(row.change) < 0.0005 ? 'muted' : row.change > 0 ? 'up' : 'down'}>
                      {Math.abs(row.change) < 0.0005 ? '0.000' : `${row.change > 0 ? '+' : ''}${row.change.toFixed(3)}`}
                    </strong>
                  </div>
                )) : <p className="muted">There are no two saved GPA checks in this period yet.</p>}
                <div className="gpa-impact-axis"><span>Lowered GPA</span><span>Raised GPA</span></div>
              </div>
            )}
            <p className="muted gpa-history-note">
              Class grades can change without moving GPA: Canvas percentages are rounded to whole numbers for the school’s quality-point bands, and class changes can offset each other. GPA is the average across graded classes; Free periods are excluded. Set course levels in Settings.
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
              Hover a marker for the saved grade and timestamp. Click a marker or a legend chip to open that course.
              Every grade change is shown. Repeated syncs with the same grade merge into one marker, so the graph stays readable.
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
