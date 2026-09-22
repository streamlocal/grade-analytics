import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useActivity, useAssignments, useCourses, useLastSync } from '../hooks/useData';
import { supabase } from '../services/supabaseClient';
import { useEffect, useState } from 'react';
import { Card, Empty, Skeleton } from '../components/ui';
import { Sparkline } from '../charts/charts';
import { delta, deltaClass, fmtDateTime, fmtPct, letterFor, scoreAt, isSubmitted } from '../utils/format';
import { overallGpa, qualityPoints, effectiveScore } from '../utils/gpa';
import type { CourseSnapshot } from '../models/types';

function useAllSnapshots(courseIds: string[]) {
  const [map, setMap] = useState<Record<string, CourseSnapshot[]>>({});
  useEffect(() => {
    if (!courseIds.length) return;
    supabase.from('course_snapshots').select('*').in('course_id', courseIds).order('created_at')
      .then(({ data }) => {
        const m: Record<string, CourseSnapshot[]> = {};
        for (const s of (data ?? []) as CourseSnapshot[]) {
          (m[s.course_id] ??= []).push(s);
        }
        setMap(m);
      });
  }, [courseIds.join(',')]);
  return map;
}

export default function Dashboard() {
  const { courses, loading, error } = useCourses();
  const { assignments } = useAssignments();
  const events = useActivity(20);
  const lastSync = useLastSync();
  const tracked = useMemo(() => courses.filter((c) => c.tracked), [courses]);
  const snaps = useAllSnapshots(tracked.map((c) => c.id));

  const dueSoon = assignments.filter((a) => a.due_at && !a.excused && a.score == null &&
    new Date(a.due_at).getTime() > Date.now() && new Date(a.due_at).getTime() < Date.now() + 7 * 86400_000);
  const missing = assignments.filter((a) => a.missing && !isSubmitted(a));
  const recentGraded = [...assignments].filter((a) => a.score != null).slice(0, 5);
  const scored = tracked.map((c) => effectiveScore(c)).filter((v): v is number => v != null);
  const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
  const gpa = overallGpa(tracked.map((c) => ({ score: effectiveScore(c), level: c.level ?? 'Regular' })));

  if (loading) return <main><Skeleton lines={6} /></main>;
  if (error) return <main><div className="error">{error}</div></main>;
  if (!tracked.length) return <main><Empty title="No tracked courses yet" hint="Go to Settings → Connection to discover courses and run your first sync." /></main>;

  return (
    <main>
      <div className="grid stats">
        <Card><div className="stat"><div className="l">Overall average</div><div className="v">{fmtPct(avg)}</div></div></Card>
        <Card><div className="stat"><div className="l">GPA (Ignatius scale)</div><div className="v">{gpa == null ? '—' : gpa.toFixed(2)}</div></div></Card>
        <Card><div className="stat"><div className="l">Tracked classes</div><div className="v">{tracked.length}</div></div></Card>
        <Card><div className="stat"><div className="l">Due soon</div><div className="v">{dueSoon.length}</div></div></Card>
        <Card><div className="stat"><div className="l">Missing</div><div className="v">{missing.length}</div></div></Card>
        <Card><div className="stat"><div className="l">Recently graded</div><div className="v">{recentGraded.length}</div></div></Card>
        <Card><div className="stat"><div className="l">Last sync</div><div className="v" style={{ fontSize: 15 }}>{fmtDateTime(lastSync?.started_at)}</div></div></Card>
      </div>

      <h2>Classes</h2>
      <div className="grid cards">
        {tracked.map((c) => {
          const s = snaps[c.id] ?? [];
          const cur = effectiveScore(c);
          const d1 = delta(scoreAt(s, 1), cur);
          const d7 = delta(scoreAt(s, 7), cur);
          const d30 = delta(scoreAt(s, 30), cur);
          const miss = missing.filter((a) => a.course_id === c.id).length;
          return (
            <Card key={c.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <Link to={`/course/${c.id}`}><strong>{c.name}</strong></Link>
                <span>{fmtPct(cur)} · {c.current_grade ?? letterFor(cur)} · QP {qualityPoints(cur, c.level ?? 'Regular')?.toFixed(2) ?? '—'}</span>
              </div>
              <Sparkline points={s.map((x) => x.score)} />
              <div className="row muted" style={{ fontSize: 13 }}>
                <span className={deltaClass(d1)}>1d {d1 == null ? '—' : `${d1 > 0 ? '+' : ''}${d1.toFixed(1)}`}</span>
                <span className={deltaClass(d7)}>7d {d7 == null ? '—' : `${d7 > 0 ? '+' : ''}${d7.toFixed(1)}`}</span>
                <span className={deltaClass(d30)}>30d {d30 == null ? '—' : `${d30 > 0 ? '+' : ''}${d30.toFixed(1)}`}</span>
                {miss > 0 && <span style={{ color: 'var(--down)' }}>{miss} missing</span>}
              </div>
            </Card>
          );
        })}
      </div>

      <h2>Activity</h2>
      <div className="feed">
        {events.length === 0 && <Empty title="No activity yet" hint="Sync twice and changes will appear here." />}
        {events.map((e) => (
          <div key={e.id} className="feed-item">
            <strong>{e.title}</strong>
            <div className="muted">{e.message}</div>
            <div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(e.created_at)}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
