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

  const dueSoon = assignments.filter((a) => a.due_at && !a.excused && a.score == null && !isSubmitted(a) &&
    new Date(a.due_at).getTime() > Date.now() && new Date(a.due_at).getTime() < Date.now() + 7 * 86400_000)
    .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''));
  const missing = assignments.filter((a) => a.missing && !a.excused && !isSubmitted(a));
  const needsAttention = assignments.filter((a) => !a.excused && !isSubmitted(a) &&
    (a.missing || (a.score == null && a.due_at != null && new Date(a.due_at).getTime() < Date.now())));
  const graded = assignments.filter((a) => a.score != null);
  const scored = tracked.map((c) => effectiveScore(c)).filter((v): v is number => v != null);
  const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
  const gpa = overallGpa(tracked.map((c) => ({ score: effectiveScore(c), level: c.level ?? 'Regular' })));

  if (loading) return <main><Skeleton lines={6} /></main>;
  if (error) return <main><div className="error">{error}</div></main>;
  if (!tracked.length) return <main><Empty title="No tracked courses yet" hint="Go to Settings → Connection to discover courses and run your first sync." /></main>;

  return (
    <main className="dashboard-page">
      <div className="page-heading"><div><p className="eyebrow">Overview</p><h1>Dashboard</h1><p className="page-subtitle">Your Canvas grades at a glance</p></div><span className="heading-meta">Last sync {fmtDateTime(lastSync?.started_at)}</span></div>
      <div className="grid stats dashboard-stats">
        <Card><div className="stat"><div className="l">Overall average</div><div className="v">{fmtPct(avg)}</div></div></Card>
        <Card><div className="stat"><div className="l">GPA (Ignatius scale)</div><div className="v">{gpa == null ? '—' : gpa.toFixed(2)}</div></div></Card>
        <Card><div className="stat"><div className="l">Tracked classes</div><div className="v">{tracked.length}</div></div></Card>
        <Card><div className="stat"><div className="l">Due soon</div><div className="v">{dueSoon.length}</div></div></Card>
        <Card><div className="stat"><div className="l">Needs attention</div><div className="v">{needsAttention.length}</div></div></Card>
        <Card><div className="stat"><div className="l">Graded assignments</div><div className="v">{graded.length}</div></div></Card>
      </div>

      <div className="dashboard-priority">
        <Card>
          <div className="priority-heading"><h2>Needs attention</h2><Link to="/assignments">View assignments ↗</Link></div>
          {needsAttention.length ? needsAttention.slice(0, 3).map((a) => (
            <div className="priority-item" key={a.id}>
              <span><strong>{a.name}</strong><small>{tracked.find((c) => c.id === a.course_id)?.name ?? 'Course'}</small></span>
              <span className="status-pill danger">{a.missing ? 'Missing' : 'Overdue'}</span>
            </div>
          )) : <p className="muted priority-empty">You’re caught up.</p>}
        </Card>
        <Card>
          <div className="priority-heading"><h2>Due soon</h2><Link to="/assignments">View assignments ↗</Link></div>
          {dueSoon.length ? dueSoon.slice(0, 3).map((a) => (
            <div className="priority-item" key={a.id}>
              <span><strong>{a.name}</strong><small>{tracked.find((c) => c.id === a.course_id)?.name ?? 'Course'}</small></span>
              <span className="priority-date">{new Date(a.due_at!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>
          )) : <p className="muted priority-empty">No open assignments due this week.</p>}
        </Card>
      </div>

      <div className="section-heading"><h2>Classes</h2><span className="muted">{tracked.length} tracked</span></div>
      <div className="grid cards">
        {tracked.map((c) => {
          const s = snaps[c.id] ?? [];
          const cur = effectiveScore(c);
          const d1 = delta(scoreAt(s, 1), cur);
          const d7 = delta(scoreAt(s, 7), cur);
          const d30 = delta(scoreAt(s, 30), cur);
          const miss = missing.filter((a) => a.course_id === c.id).length;
          return (
            <Card key={c.id} className="course-card">
              <div className="row course-card-top" style={{ justifyContent: 'space-between' }}>
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

      <div className="section-heading"><h2>Activity</h2></div>
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
