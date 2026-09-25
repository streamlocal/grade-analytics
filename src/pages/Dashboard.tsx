import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fetchSnapshotsForCourses, useActivity, useAssignments, useCourses, useLastSync } from '../hooks/useData';
import { useEffect, useState } from 'react';
import { Card, Empty, Skeleton } from '../components/ui';
import { Sparkline } from '../charts/charts';
import { delta, deltaClass, fmtDateTime, fmtPct, letterFor, scoreAt, isSubmitted } from '../utils/format';
import { overallGpa, qualityPoints, roundedGpaPercent } from '../utils/gpa';
import type { CourseSnapshot } from '../models/types';
import { activityLabel, activityTime } from '../utils/activity';

type TrendDays = 1 | 7 | 30;
const trendDays: TrendDays[] = [1, 7, 30];

function useAllSnapshots(courseIds: string[], refresh: number) {
  const [map, setMap] = useState<Record<string, CourseSnapshot[]>>({});
  const previousCourseKey = useRef<string | undefined>(undefined);
  const courseKey = courseIds.join(',');
  useEffect(() => {
    let cancelled = false;
    // Preserve completed chart data while a background update is read.
    if (previousCourseKey.current !== courseKey) setMap({});
    previousCourseKey.current = courseKey;
    if (!courseIds.length) return () => { cancelled = true; };
    void fetchSnapshotsForCourses(courseIds).then((data) => {
        if (cancelled) return;
        const m: Record<string, CourseSnapshot[]> = {};
        for (const s of data) {
          (m[s.course_id] ??= []).push(s);
        }
        setMap(m);
      }).catch(() => { if (!cancelled) setMap({}); });
    return () => { cancelled = true; };
  }, [courseKey, refresh]);
  return map;
}

export default function Dashboard() {
  const [allTrendDays, setAllTrendDays] = useState<TrendDays>(7);
  const [courseTrendDays, setCourseTrendDays] = useState<Record<string, TrendDays>>({});
  const [now, setNow] = useState(() => Date.now());
  const [snapshotRefresh, setSnapshotRefresh] = useState(0);
  const { courses, loading, error } = useCourses();
  const { assignments, loading: assignmentsLoading, error: assignmentsError } = useAssignments();
  const activity = useActivity();
  const { run: lastSync } = useLastSync();
  const tracked = useMemo(() => courses.filter((c) => c.tracked), [courses]);
  const assignmentLinks = useMemo(() => new Map(assignments.map((assignment) => [assignment.id, assignment.html_url])), [assignments]);
  const snaps = useAllSnapshots(tracked.map((c) => c.id), snapshotRefresh);

  useEffect(() => {
    const reload = () => setSnapshotRefresh((value) => value + 1);
    window.addEventListener('ga-sync-complete', reload);
    return () => window.removeEventListener('ga-sync-complete', reload);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    const refreshClock = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    document.addEventListener('visibilitychange', refreshClock);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refreshClock); };
  }, []);

  const dueSoon = assignments.filter((a) => a.due_at && !a.excused && a.score == null && !isSubmitted(a) &&
    new Date(a.due_at).getTime() > now && new Date(a.due_at).getTime() <= now + 14 * 86400_000)
    .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''));
  const missing = assignments.filter((a) => a.missing && !a.excused && !isSubmitted(a));
  const needsAttention = assignments.filter((a) => !a.excused && !isSubmitted(a) &&
    (a.missing || (a.score == null && a.due_at != null && new Date(a.due_at).getTime() < now)));
  const graded = assignments.filter((a) => a.score != null);
  const scored = tracked.map((c) => c.current_score).filter((v): v is number => v != null);
  const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
  const gpa = overallGpa(tracked.map((c) => ({ score: c.current_score, level: c.level ?? 'Regular' })));
  // Put the most actionable card in the left-hand, first-read position.
  const priorityOrder = needsAttention.length ? ['attention', 'upcoming'] as const : ['upcoming', 'attention'] as const;

  if (loading) return <main><Skeleton lines={6} /></main>;
  if (error) return <main><div className="error">{error}</div></main>;
  if (!tracked.length) return <main><Empty title="No tracked courses yet" hint="Go to Settings → Connection to discover courses and run your first sync." /></main>;

  return (
    <main className="dashboard-page">
      <div className="page-heading"><div><p className="eyebrow">Overview</p><h1>Dashboard</h1><p className="page-subtitle">Your Canvas grades at a glance</p></div><span className="heading-meta">Last sync {fmtDateTime(lastSync?.started_at)}</span></div>
      {assignmentsError && <div className="error dashboard-assignment-error" role="alert">Assignment data is unavailable. Open Assignments to try again.</div>}
      <div className="grid stats dashboard-stats">
        <Card><div className="stat"><div className="l">Overall average</div><div className="v">{fmtPct(avg)}</div></div></Card>
        <Card><div className="stat"><div className="l">Current GPA (Ignatius scale)</div><div className="v">{gpa == null ? '—' : gpa.toFixed(3)}</div></div></Card>
        <Card><div className="stat"><div className="l">Tracked classes</div><div className="v">{tracked.length}</div></div></Card>
        <Card><div className="stat"><div className="l">Due soon</div><div className="v">{assignmentsLoading || assignmentsError ? '—' : dueSoon.length}</div></div></Card>
        <Card><div className="stat"><div className="l">Needs attention</div><div className="v">{assignmentsLoading || assignmentsError ? '—' : needsAttention.length}</div></div></Card>
        <Card><div className="stat"><div className="l">Graded assignments</div><div className="v">{assignmentsLoading || assignmentsError ? '—' : graded.length}</div></div></Card>
      </div>

      <div className="dashboard-priority">
        {priorityOrder.map((section) => section === 'attention' ? (
          <Card key="attention">
            <div className="priority-heading"><h2>Needs attention</h2><Link to="/assignments?view=attention">View assignments ↗</Link></div>
            {needsAttention.length ? needsAttention.slice(0, 3).map((a) => (
              <div className="priority-item" key={a.id}>
                <span><strong>{a.name}</strong><small>{tracked.find((c) => c.id === a.course_id)?.name ?? 'Course'}</small></span>
                <span className="status-pill danger">{a.missing ? 'Missing' : 'Overdue'}</span>
              </div>
            )) : !assignmentsError && <p className="muted priority-empty">{assignmentsLoading ? 'Loading assignments…' : 'You’re caught up.'}</p>}
          </Card>
        ) : (
          <Card key="upcoming">
            <div className="priority-heading"><h2>Due soon</h2><Link to="/assignments?view=upcoming">View assignments ↗</Link></div>
            {dueSoon.length ? dueSoon.slice(0, 3).map((a) => (
              <div className="priority-item" key={a.id}>
                <span><strong>{a.name}</strong><small>{tracked.find((c) => c.id === a.course_id)?.name ?? 'Course'}</small></span>
                <span className="priority-date">{new Date(a.due_at!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
            )) : !assignmentsError && <p className="muted priority-empty">{assignmentsLoading ? 'Loading assignments…' : 'No open assignments due in the next 14 days.'}</p>}
          </Card>
        ))}
      </div>

      <div className="section-heading classes-heading">
        <h2>Classes <span className="muted">{tracked.length} tracked</span></h2>
        <div className="trend-all-controls" role="group" aria-label="Time range for all classes">
          <span>All classes</span>
          {trendDays.map((days) => <button key={days} type="button" className={`trend-all-button ${allTrendDays === days && Object.keys(courseTrendDays).length === 0 ? 'active' : ''}`}
            aria-pressed={allTrendDays === days && Object.keys(courseTrendDays).length === 0}
            onClick={() => { setAllTrendDays(days); setCourseTrendDays({}); }}>{days}d</button>)}
        </div>
      </div>
      <div className="grid cards">
        {tracked.map((c) => {
          const s = snaps[c.id] ?? [];
          const cur = c.current_score;
          const selectedDays = courseTrendDays[c.id] ?? allTrendDays;
          const cutoff = now - selectedDays * 86400_000;
          const older = s.filter((point) => new Date(point.created_at).getTime() < cutoff);
          const chartSnaps = [...older.slice(-1), ...s.filter((point) => new Date(point.created_at).getTime() >= cutoff)];
          const miss = missing.filter((a) => a.course_id === c.id).length;
          return (
            <Card key={c.id} className="course-card">
              <div className="row course-card-top" style={{ justifyContent: 'space-between' }}>
                <Link to={`/course/${c.id}`}><strong>{c.name}</strong></Link>
                <span title={c.level === 'Free' ? 'Excluded from GPA' : cur == null ? undefined : `Quality points use ${roundedGpaPercent(cur)}% after rounding`}>{fmtPct(cur)} · {c.current_grade ?? letterFor(cur)} · QP {qualityPoints(cur, c.level ?? 'Regular')?.toFixed(2) ?? '—'}</span>
              </div>
              <Sparkline points={chartSnaps.map((x) => x.score)} />
              <div className="course-trend-controls" role="group" aria-label={`${c.name} time range`}>
                {trendDays.map((days) => {
                  const change = delta(scoreAt(s, days), cur);
                  return <button key={days} type="button" className={`trend-choice ${selectedDays === days ? 'active' : ''}`}
                    aria-pressed={selectedDays === days} aria-label={`Show ${days}-day trend for ${c.name}`}
                    onClick={() => setCourseTrendDays((current) => ({ ...current, [c.id]: days }))}>
                    <span>{days}d</span><strong className={deltaClass(change)}>{change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}`}</strong>
                  </button>;
                })}
              </div>
              {miss > 0 && <span className="course-missing">{miss} missing</span>}
            </Card>
          );
        })}
      </div>

      <div className="section-heading activity-heading"><div><h2>Activity</h2><p className="muted">Last 24 hours · Unseen announcements stay for up to 7 days</p></div></div>
      <div className="feed">
        {activity.error && <div className="error" role="alert">{activity.error}</div>}
        {activity.loading && <p className="muted" role="status">Loading activity…</p>}
        {!activity.loading && activity.events.length === 0 && <Empty title="No new activity" hint="Grade, assignment, and due-date changes appear here after Canvas syncs." />}
        {activity.events.map((e) => {
          const canvasUrl = e.type === 'ANNOUNCEMENT_POSTED' ? e.new_value?.html_url : e.assignment_id ? assignmentLinks.get(e.assignment_id) : null;
          const safeCanvasUrl = typeof canvasUrl === 'string' && /^https:\/\//.test(canvasUrl) ? canvasUrl : null;
          return (
          <div key={e.id} className="feed-item">
            <div className="feed-copy">
              <div className="feed-meta"><span className="feed-kind">{activityLabel(e)}</span><time dateTime={new Date(activityTime(e)).toISOString()}>{e.type === 'ANNOUNCEMENT_POSTED' ? 'Posted' : 'Detected'} {fmtDateTime(new Date(activityTime(e)).toISOString())}</time></div>
              <strong>{e.title}</strong>
              {e.message && <p className="muted">{e.message}</p>}
              {safeCanvasUrl && <a href={safeCanvasUrl} target="_blank" rel="noopener noreferrer">Open in Canvas ↗</a>}
            </div>
            <button type="button" className="feed-seen" aria-label={`Mark as seen: ${e.title}`} title="Mark as seen" onClick={() => void activity.markSeen(e)}>✓</button>
          </div>
          );
        })}
      </div>
    </main>
  );
}
