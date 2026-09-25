import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAssignments, useCourses } from '../hooks/useData';
import { Empty, Skeleton } from '../components/ui';
import { isSubmitted } from '../utils/format';
import type { Assignment } from '../models/types';
import { Link } from 'react-router-dom';

type View = 'attention' | 'upcoming' | 'all' | 'graded';
type Sort = 'due' | 'course' | 'name' | 'score' | 'graded';

function dueTime(a: Assignment): number {
  if (!a.due_at) return Number.POSITIVE_INFINITY;
  const time = new Date(a.due_at).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function compareDue(a: Assignment, b: Assignment): number {
  const first = dueTime(a), second = dueTime(b);
  if (first === second) return a.name.localeCompare(b.name);
  return first === Number.POSITIVE_INFINITY ? 1 : second === Number.POSITIVE_INFINITY ? -1 : first - second;
}

function historicalGradeTime(a: Assignment): number {
  const time = new Date(a.submitted_at ?? a.due_at ?? '').getTime();
  return Number.isFinite(time) ? time : 0;
}

function dateGroup(a: Assignment, now: number): string {
  const due = dueTime(a);
  if (due === Number.POSITIVE_INFINITY) return 'No due date';
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  if (due < today) return 'Past due';
  if (due < today + 86400_000) return 'Today';
  if (due < today + 2 * 86400_000) return 'Tomorrow';
  if (due < today + 7 * 86400_000) return 'Next 7 days';
  return 'Later';
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function isOpen(a: Assignment): boolean {
  return !a.excused && a.score == null && !isSubmitted(a);
}

function needsAttention(a: Assignment, now: number): boolean {
  return !a.excused && !isSubmitted(a) && (a.missing || (a.score == null && dueTime(a) < now));
}

function isUpcoming(a: Assignment, now: number): boolean {
  const due = dueTime(a);
  return isOpen(a) && due >= now && due <= now + 14 * 86400_000;
}

function statusOf(a: Assignment, now: number): { label: string; tone: string } {
  if (a.excused) return { label: 'Excused', tone: 'neutral' };
  if (a.missing && !isSubmitted(a)) return { label: 'Missing', tone: 'danger' };
  if (a.score != null) return { label: 'Graded', tone: 'success' };
  if (isSubmitted(a)) return { label: 'Submitted', tone: 'success' };
  if (dueTime(a) < now) return { label: 'Overdue', tone: 'danger' };
  if (a.late) return { label: 'Late', tone: 'warning' };
  return { label: 'To do', tone: 'info' };
}

function dueLabel(a: Assignment): string {
  if (!a.due_at) return 'No due date';
  const date = new Date(a.due_at);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function scoreLabel(a: Assignment): string {
  if (a.score == null) return a.points_possible == null ? 'Not graded' : `Out of ${a.points_possible} pts`;
  return `${a.score} / ${a.points_possible ?? '—'} pts`;
}

function looksLikeQuiz(a: Assignment): boolean {
  return /\/quizzes\/\d+(?:[/?#]|$)/.test(a.html_url ?? '')
    || /\b(quiz|test|exam)\b/i.test(a.name)
    || /^(test|quiz|exam)$/i.test(a.category ?? '');
}

export default function Assignments() {
  const { courses } = useCourses();
  const { assignments, loading, error, reload } = useAssignments();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState('all');
  const [sort, setSort] = useState<Sort | null>(null);
  const [gradeTimes, setGradeTimes] = useState<Map<string, number>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    const refreshClock = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    document.addEventListener('visibilitychange', refreshClock);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refreshClock); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadGradeTimes() {
      const latest = new Map<string, number>();
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error: queryError } = await supabase.from('activity_events')
          .select('assignment_id,created_at')
          .in('type', ['ASSIGNMENT_GRADED', 'ASSIGNMENT_SCORE_CHANGED'])
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (cancelled || queryError) return;
        for (const event of data ?? []) {
          if (event.assignment_id && !latest.has(event.assignment_id)) {
            latest.set(event.assignment_id, new Date(event.created_at).getTime());
          }
        }
        if (!data || data.length < pageSize) break;
      }
      if (!cancelled) setGradeTimes(latest);
    }
    void loadGradeTimes();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches('input, select, textarea, [contenteditable="true"]');
      if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && target === searchRef.current) {
        setSearch('');
        searchRef.current?.blur();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const courseNames = useMemo(() => new Map(courses.map((c) => [c.id, c.name])), [courses]);
  const counts = useMemo(() => ({
    attention: assignments.filter((a) => needsAttention(a, now)).length,
    upcoming: assignments.filter((a) => isUpcoming(a, now)).length,
    all: assignments.length,
    graded: assignments.filter((a) => a.score != null).length,
  }), [assignments, now]);
  const requestedView = searchParams.get('view');
  const selectedView: View = requestedView === 'attention' || requestedView === 'upcoming' || requestedView === 'all' || requestedView === 'graded'
    ? requestedView : counts.attention > 0 ? 'attention' : 'upcoming';
  const selectedSort: Sort = sort ?? (selectedView === 'graded' ? 'graded' : 'due');

  const rows = useMemo(() => assignments.filter((a) => {
    if (selectedView === 'attention' && !needsAttention(a, now)) return false;
    if (selectedView === 'upcoming' && !isUpcoming(a, now)) return false;
    if (selectedView === 'graded' && a.score == null) return false;
    if (courseId !== 'all' && a.course_id !== courseId) return false;
    const query = search.trim().toLocaleLowerCase();
    if (query && !`${a.name} ${courseNames.get(a.course_id) ?? ''} ${a.category ?? ''}`.toLocaleLowerCase().includes(query)) return false;
    return true;
  }).sort((a, b) => {
    if (selectedSort === 'graded') {
      const aObserved = gradeTimes.get(a.id);
      const bObserved = gradeTimes.get(b.id);
      if (aObserved != null && bObserved == null) return -1;
      if (bObserved != null && aObserved == null) return 1;
      const aTime = aObserved ?? historicalGradeTime(a);
      const bTime = bObserved ?? historicalGradeTime(b);
      return bTime - aTime || a.name.localeCompare(b.name);
    }
    if (selectedSort === 'name') return a.name.localeCompare(b.name);
    if (selectedSort === 'course') return (courseNames.get(a.course_id) ?? '').localeCompare(courseNames.get(b.course_id) ?? '') || compareDue(a, b);
    if (selectedSort === 'score') return (b.score == null ? -1 : b.points_possible ? b.score / b.points_possible : b.score) - (a.score == null ? -1 : a.points_possible ? a.score / a.points_possible : a.score);
    return compareDue(a, b);
  }), [assignments, selectedView, courseId, search, selectedSort, courseNames, now, gradeTimes]);

  const groups = useMemo(() => {
    if (selectedView === 'graded' && selectedSort === 'graded') {
      const grouped = new Map<string, Assignment[]>([
        ['Last 24 hours', []], ['Last 7 days', []], ['Before that', []],
      ]);
      for (const assignment of rows) {
        const gradedAt = gradeTimes.get(assignment.id);
        const label = gradedAt != null && gradedAt >= now - 86400_000 ? 'Last 24 hours'
          : gradedAt != null && gradedAt >= now - 7 * 86400_000 ? 'Last 7 days' : 'Before that';
        grouped.get(label)?.push(assignment);
      }
      return [...grouped].filter(([, items]) => items.length > 0).map(([label, items]) => ({ label, items }));
    }
    if (selectedSort !== 'due') return [{ label: '', items: rows }];
    const grouped = new Map<string, Assignment[]>();
    for (const a of rows) {
      const label = dateGroup(a, now);
      if (!grouped.has(label)) grouped.set(label, []);
      grouped.get(label)?.push(a);
    }
    return ['Past due', 'Today', 'Tomorrow', 'Next 7 days', 'Later', 'No due date']
      .filter((label) => grouped.has(label))
      .map((label) => ({ label, items: grouped.get(label) ?? [] }));
  }, [rows, selectedSort, selectedView, now, gradeTimes]);

  function exportCsv() {
    const headers = ['Assignment', 'Course', 'Category', 'Due', 'Score', 'Points possible', 'Status', 'Canvas URL'];
    const records = rows.map((a) => [
      a.name, courseNames.get(a.course_id) ?? '', a.category ?? '', a.due_at ?? '',
      a.score?.toString() ?? '', a.points_possible?.toString() ?? '', statusOf(a, now).label, a.html_url ?? '',
    ]);
    const csv = [headers, ...records].map((record) => record.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'grade-analytics-assignments.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function setSubmission(a: Assignment, value: boolean | null) {
    setBusyId(a.id);
    setMessage(null);
    try {
      const { error: updateError } = await supabase.from('assignments')
        .update({ submitted_override: value }).eq('id', a.id);
      if (updateError) throw updateError;
      reload();
    } catch (caught: unknown) {
      setMessage(caught instanceof Error ? caught.message : 'Could not update this assignment. Try again.');
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { id: View; label: string }[] = [
    { id: 'attention', label: 'Needs attention' },
    { id: 'upcoming', label: 'Due soon' },
    { id: 'all', label: 'All assignments' },
    { id: 'graded', label: 'Graded' },
  ];

  return (
    <main className="assignments-page">
      <div className="page-heading">
        <div><p className="eyebrow">Coursework</p><h1>Assignments</h1><p className="page-subtitle">Find what is due and keep your submission status organized.</p></div>
        <Link className="btn" to="/quizzes">Browse quizzes</Link>
      </div>

      <div className="assignment-tabs" role="group" aria-label="Assignment views">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" aria-pressed={selectedView === tab.id}
            className={`assignment-tab ${selectedView === tab.id ? 'active' : ''}`} onClick={() => { setSearchParams({ view: tab.id }); setSort(null); }}>
            {tab.label}<span className="assignment-count">{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div className="assignment-controls">
        <label className="assignment-search">Search assignments
          <input ref={searchRef} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, class, or category" />
        </label>
        <label>Course
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="all">All courses</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Sort by
          <select value={selectedSort} onChange={(e) => setSort(e.target.value as Sort)}>
            {selectedView === 'graded' && <option value="graded">Most recently graded</option>}
            <option value="due">Due date</option>
            <option value="course">Course</option>
            <option value="name">Name</option>
            <option value="score">Score</option>
          </select>
        </label>
      </div>

      <div className="assignment-results"><strong>{rows.length}</strong> {rows.length === 1 ? 'assignment' : 'assignments'} shown
        {(search || courseId !== 'all') && <button type="button" className="btn ghost" onClick={() => { setSearch(''); setCourseId('all'); }}>Clear filters</button>}
        <button type="button" className="btn assignment-export" disabled={!rows.length} onClick={exportCsv}>Export CSV</button>
      </div>
      {selectedView === 'graded' && selectedSort === 'graded' && <p className="assignment-grade-note">Groups use grade changes found by sync. Grades imported before tracking began appear under “Before that.”</p>}
      {message && <div className="error" role="alert">{message}</div>}
      {error && <div className="error" role="alert">Assignments could not load: {error} <button type="button" className="btn" onClick={reload}>Try again</button></div>}

      {loading ? <Skeleton lines={5} /> : error ? null : rows.length === 0 ? (
        <Empty title={selectedView === 'attention' ? 'Nothing needs attention' : selectedView === 'graded' ? 'No graded assignments yet' : 'No assignments found'}
          hint={search || courseId !== 'all' ? 'Try a different search or clear your filters.' : selectedView === 'attention' ? 'Nothing overdue or missing right now.' : selectedView === 'upcoming' ? 'No open assignments are due in the next 14 days.' : selectedView === 'graded' ? 'Graded work will appear here after Canvas returns a score.' : 'Assignments will appear here after a Canvas sync.'} />
      ) : (
        <div className="assignment-groups">
          {groups.map((group) => <section key={group.label || 'all'} className="assignment-group">
          {group.label ? <h2 className="assignment-group-title">{group.label}<span>{group.items.length}</span></h2> : <h2 className="sr-only">Assignments list</h2>}
          <div className="assignment-list">{group.items.map((a) => {
            const status = statusOf(a, now);
            const submitted = isSubmitted(a);
            const canvasCourseId = courses.find((course) => course.id === a.course_id)?.lms_course_id;
            const quizPath = canvasCourseId && looksLikeQuiz(a) ? `/quiz-assignment/${canvasCourseId}/${a.lms_assignment_id}` : null;
            return (
              <article key={a.id} className="assignment-item">
                <div className="assignment-main">
                  <div className="assignment-title-row">
                    <h3>{quizPath ? <Link to={quizPath} state={{ canvasUrl: a.html_url ?? undefined }}>{a.name}</Link> : a.html_url ? <a href={a.html_url} target="_blank" rel="noreferrer">{a.name}</a> : a.name}</h3>
                    <span className={`status-pill ${status.tone}`}>{status.label}</span>
                  </div>
                  <p className="assignment-course">{courseNames.get(a.course_id) ?? 'Unknown course'}{a.category ? ` · ${a.category}` : ''}</p>
                  <div className="assignment-meta">
                    <span><strong>Due</strong> {dueLabel(a)}</span>
                    <span><strong>Score</strong> {scoreLabel(a)}</span>
                  </div>
                </div>
                <div className="assignment-actions">
                  {quizPath && <Link className="btn primary" to={quizPath} state={{ canvasUrl: a.html_url ?? undefined }}>Open quiz</Link>}
                  {(a.score == null || a.missing) && !a.excused && (
                    <button type="button" className={`btn ${submitted ? '' : 'primary'}`} disabled={busyId === a.id}
                      onClick={() => setSubmission(a, !submitted)}>
                      {busyId === a.id ? 'Saving…' : submitted ? 'Mark not submitted' : 'Mark submitted'}
                    </button>
                  )}
                  {a.submitted_override != null && (
                    <button type="button" className="btn ghost" disabled={busyId === a.id}
                      onClick={() => setSubmission(a, null)}>Use Canvas status</button>
                  )}
                  {a.html_url && <a className="assignment-open" href={a.html_url} target="_blank" rel="noreferrer">Open in Canvas ↗</a>}
                </div>
              </article>
            );
          })}</div>
          </section>)}
        </div>
      )}
      <p className="assignment-note">Submission changes here only update your tracker. Submit the work in Canvas.</p>
    </main>
  );
}
