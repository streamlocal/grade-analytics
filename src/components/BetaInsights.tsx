import { useEffect, useMemo, useState } from 'react';
import { Card } from './ui';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/AuthContext';
import { useBetaStore } from '../hooks/useBetaStore';
import type { ActivityEvent, Assignment, Course, SyncRun } from '../models/types';
import { activityLabel } from '../utils/activity';
import { fmtDateTime } from '../utils/format';
import { overallGpa } from '../utils/gpa';

function beforeAfter(event: ActivityEvent) {
  const value = (record: Record<string, unknown> | null) => {
    if (!record) return 'None';
    if ('score' in record) return record.score == null ? 'Ungraded' : String(record.score);
    if ('dueAt' in record) return record.dueAt ? fmtDateTime(String(record.dueAt)) : 'No due date';
    if ('missing' in record) return record.missing ? 'Missing' : 'Not missing';
    return Object.values(record).map(String).join(', ') || 'None';
  };
  return `${value(event.old_value)} → ${value(event.new_value)}`;
}

export function SyncChanges({ events, run, error }: { events: ActivityEvent[]; run: SyncRun | null; error: string }) {
  const changes = events.filter((event) => event.type !== 'ANNOUNCEMENT_POSTED');
  const grades = changes.filter((event) => event.type === 'GRADE_CHANGED').length;
  const added = changes.filter((event) => event.type === 'ASSIGNMENT_ADDED').length;
  const moved = changes.filter((event) => event.type === 'DUE_DATE_CHANGED').length;
  return <Card className="beta-card"><div className="section-heading"><h2>What changed?</h2><span className="muted">Latest sync {fmtDateTime(run?.started_at)}</span></div>
    {error ? <p className="error">{error}</p> : !changes.length ? <p className="muted">No grade, assignment, or due-date changes in the latest sync.</p> : <>
      <p className="beta-summary">{[grades && `${grades} course grade ${grades === 1 ? 'change' : 'changes'}`, added && `${added} new ${added === 1 ? 'assignment' : 'assignments'}`, moved && `${moved} due ${moved === 1 ? 'date moved' : 'dates moved'}`].filter(Boolean).join(' · ') || `${changes.length} other changes`}</p>
      <div className="beta-change-list">{changes.map((event) => <details key={event.id}><summary><span>{activityLabel(event)}</span><strong>{event.title}</strong></summary><p>{event.message}</p><p className="muted">Before → after: {beforeAfter(event)}</p></details>)}</div>
    </>}
  </Card>;
}

export function GradeExplanations({ events, courses }: { events: ActivityEvent[]; courses: Course[] }) {
  const courseChanges = events.filter((event) => event.type === 'GRADE_CHANGED');
  const names = new Map(courses.map((course) => [course.id, course.name]));
  return <Card className="beta-card"><h2>Grade-change explanations</h2>{courseChanges.length ? courseChanges.map((change) => {
    const related = events.filter((event) => event.course_id === change.course_id && ['ASSIGNMENT_GRADED', 'ASSIGNMENT_SCORE_CHANGED'].includes(event.type));
    return <div className="beta-explanation" key={change.id}><strong>{names.get(change.course_id ?? '') ?? change.title}: {beforeAfter(change)}%</strong>
      {related.length ? <p>Likely cause: {related.map((event) => event.title).join('; ')}. Canvas weighting or other gradebook rules may also affect the result.</p> : <p>Canvas reported a course-grade change, but no matching assignment score change was detected in this sync. Its exact cause is unknown.</p>}
    </div>;
  }) : <p className="muted">No course-grade movement in the latest sync.</p>}</Card>;
}

export function Goals({ courses }: { courses: Course[] }) {
  const store = useBetaStore();
  const [draftGpa, setDraftGpa] = useState<string | null>(null);
  const [draftCourses, setDraftCourses] = useState<Record<string, string>>({});
  const gpa = overallGpa(courses.filter((course) => course.tracked).map((course) => ({ score: course.current_score, level: course.level ?? 'Regular' })));
  return <Card className="beta-card"><h2>Goals and thresholds</h2><p className="muted">Targets are private to your account. “At risk” means the current grade is below the target or within one percentage point.</p>
    <div className="beta-goals-list"><div className="beta-goal-row"><strong>Overall GPA</strong><span>{gpa?.toFixed(3) ?? '—'}</span><input type="number" min="0" max="5" step="0.001" value={draftGpa ?? (store.data.gpaGoal?.toString() ?? '')} onChange={(event) => setDraftGpa(event.target.value)} placeholder="Target GPA" aria-label="Target GPA" /><button className="btn" onClick={() => { const value = draftGpa ?? (store.data.gpaGoal?.toString() ?? ''); void store.save({ ...store.data, gpaGoal: value === '' ? null : Number(value) }); }}>Save</button>{store.data.gpaGoal != null && <em className={gpa != null && gpa < store.data.gpaGoal ? 'goal-risk' : 'goal-safe'}>{gpa != null && gpa < store.data.gpaGoal ? 'Below goal' : 'On target'}</em>}</div>
      {courses.filter((course) => course.tracked).map((course) => { const target = store.data.courseGoals[course.id]; const score = course.current_score; return <div className="beta-goal-row" key={course.id}><strong>{course.name}</strong><span>{score == null ? '—' : `${score.toFixed(1)}%`}</span><input type="number" min="0" max="100" step="0.1" value={draftCourses[course.id] ?? (target?.toString() ?? '')} onChange={(event) => setDraftCourses((current) => ({ ...current, [course.id]: event.target.value }))} placeholder="Target %" aria-label={`Target for ${course.name}`} /><button className="btn" onClick={() => { const next = { ...store.data.courseGoals }; const value = draftCourses[course.id] ?? (target?.toString() ?? ''); if (value === '') delete next[course.id]; else next[course.id] = Number(value); void store.save({ ...store.data, courseGoals: next }); }}>Save</button>{target != null && <em className={score != null && score < target + 1 ? 'goal-risk' : 'goal-safe'}>{score != null && score < target ? 'Below goal' : score != null && score < target + 1 ? 'Near threshold' : 'On target'}</em>}</div>; })}</div>
    {store.error && <p className="error">{store.error}</p>}
  </Card>;
}

export function ActivityExplorer({ courses }: { courses: Course[] }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('all');
  const [kind, setKind] = useState('all');
  const [onlySeen, setOnlySeen] = useState(false);
  async function load(start = 0) {
    const result = await supabase.from('activity_events').select('*').order('created_at', { ascending: false }).range(start, start + 99);
    if (result.error) { setError(result.error.message); return; }
    const next = (result.data ?? []) as ActivityEvent[];
    setEvents((current) => start ? [...current, ...next] : next);
    setOffset(start + next.length); setMore(next.length === 100); setError('');
  }
  useEffect(() => { void load(); const refresh = () => { void load(); }; window.addEventListener('ga-sync-complete', refresh); window.addEventListener('ga-activity-change', refresh); return () => { window.removeEventListener('ga-sync-complete', refresh); window.removeEventListener('ga-activity-change', refresh); }; }, []);
  const types = [...new Set(events.map((event) => event.type))].sort();
  const visible = events.filter((event) => (course === 'all' || event.course_id === course) && (kind === 'all' || event.type === kind) && (!onlySeen || Boolean(event.new_value?.acknowledged_at)) && `${event.title} ${event.message}`.toLowerCase().includes(query.toLowerCase()));
  async function undo(event: ActivityEvent) {
    const newValue = { ...(event.new_value ?? {}) };
    delete newValue.acknowledged_at;
    const { error: updateError } = await supabase.from('activity_events').update({ new_value: newValue }).eq('id', event.id);
    if (updateError) setError(updateError.message);
    else { setEvents((current) => current.map((row) => row.id === event.id ? { ...row, new_value: newValue } : row)); window.dispatchEvent(new Event('ga-sync-complete')); }
  }
  return <Card className="beta-card"><h2>Activity controls</h2><p className="muted">Search the saved activity history. Checked-off items remain here; undo restores them to Activity while they are still within its time window.</p>
    <div className="beta-activity-filters"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" aria-label="Search activity" /><select value={course} onChange={(event) => setCourse(event.target.value)} aria-label="Filter activity by class"><option value="all">All classes</option>{courses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Filter activity by type"><option value="all">All types</option>{types.map((type) => <option key={type} value={type}>{activityLabel({ type } as ActivityEvent)}</option>)}</select><label><input type="checkbox" checked={onlySeen} onChange={(event) => setOnlySeen(event.target.checked)} /> Checked-off only</label></div>
    {error && <p className="error">{error}</p>}
    {visible.slice(0, 100).map((event) => <div className="beta-history-row" key={event.id}><span><strong>{event.title}</strong><small>{activityLabel(event)} · {fmtDateTime(event.created_at)} {event.new_value?.acknowledged_at ? '· Checked off' : ''}</small></span>{event.new_value?.acknowledged_at && <button className="btn ghost" onClick={() => void undo(event)}>Undo checkmark</button>}</div>)}
    {!visible.length && <p className="muted">No matching activity in the loaded history.</p>}{more && <button className="btn" onClick={() => void load(offset)}>Load older activity</button>}
  </Card>;
}

export function NotificationDigest({ events, run, assignments, courses }: { events: ActivityEvent[]; run: SyncRun | null; assignments: Assignment[]; courses: Course[] }) {
  const { user } = useAuth();
  const store = useBetaStore();
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const dueSoon = useMemo(() => assignments.filter((assignment) => assignment.due_at && assignment.score == null && new Date(assignment.due_at).getTime() > Date.now() && new Date(assignment.due_at).getTime() < Date.now() + 24 * 3600_000).length, [assignments]);
  const gradeCount = events.filter((event) => ['ASSIGNMENT_GRADED', 'ASSIGNMENT_SCORE_CHANGED'].includes(event.type)).length;
  const movedCount = events.filter((event) => event.type === 'DUE_DATE_CHANGED').length;
  const atRisk = courses.some((course) => { const target = store.data.courseGoals[course.id]; return target != null && course.current_score != null && course.current_score < target + 1; });
  useEffect(() => {
    if (!user || !run || permission !== 'granted' || typeof Notification === 'undefined') return;
    const key = `ga-notified:${user.id}`;
    const previous = localStorage.getItem(key);
    const id = `${run.id}:${new Date().toDateString()}`;
    if (!previous) { localStorage.setItem(key, id); return; }
    if (previous === id) return;
    const parts = [store.data.notify.grades && gradeCount ? `${gradeCount} new grade update${gradeCount === 1 ? '' : 's'}` : '', store.data.notify.dueDates && movedCount ? `${movedCount} moved due date${movedCount === 1 ? '' : 's'}` : '', store.data.notify.dueSoon && dueSoon ? `${dueSoon} assignment${dueSoon === 1 ? '' : 's'} due within 24 hours` : '', store.data.notify.goalRisk && atRisk ? 'A grade goal is at risk' : ''].filter(Boolean);
    if (parts.length && document.visibilityState === 'hidden') new Notification('Grade Analytics digest', { body: parts.join(' · ') });
    localStorage.setItem(key, id);
  }, [user?.id, run?.id, permission, gradeCount, movedCount, dueSoon, atRisk, store.data.notify]);
  return <Card className="beta-card"><h2>Notification digest</h2><p className="muted">Latest sync: {gradeCount} grade updates · {movedCount} moved due dates. {dueSoon} open assignments are due within 24 hours. Browser alerts appear only when this page is in the background and you have opted in below.</p>{permission === 'default' && <button className="btn" onClick={() => void Notification.requestPermission().then(setPermission)}>Allow browser alerts</button>}{permission === 'denied' && <p className="muted">Browser alerts are blocked. You can change this in your browser’s site settings.</p>}{permission === 'unsupported' && <p className="muted">This browser does not support notifications.</p>}</Card>;
}
