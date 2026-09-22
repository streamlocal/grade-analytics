import { useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAssignments, useCourses } from '../hooks/useData';
import { Card } from '../components/ui';
import { isSubmitted } from '../utils/format';
import type { Assignment } from '../models/types';

function statusOf(a: Assignment): string {
  if (a.excused) return 'Excused';
  if (isSubmitted(a)) return a.score == null ? 'Submitted' : 'Graded';
  if (a.missing) return 'Missing';
  if (a.late) return 'Late';
  return 'Unsubmitted';
}

function SubmittedToggle({ a, onSaved }: { a: Assignment; onSaved: () => void }) {
  const submitted = isSubmitted(a);
  const manual = a.submitted_override != null;
  async function toggle() {
    await supabase.from('assignments').update({ submitted_override: !submitted }).eq('id', a.id);
    onSaved();
  }
  async function reset() {
    await supabase.from('assignments').update({ submitted_override: null }).eq('id', a.id);
    onSaved();
  }
  return (
    <span className="row" style={{ gap: 4 }}>
      <button className={`chip ${submitted ? 'chip-on' : ''}`} onClick={toggle}
        title={manual ? 'Manually set — click to toggle' : 'From Canvas — click to override'}>
        {submitted ? '✓ Submitted' : 'Not submitted'}
      </button>
      {manual && <button className="btn ghost" style={{ padding: '2px 8px' }} onClick={reset} title="Reset to Canvas">↺</button>}
    </span>
  );
}

export default function Assignments() {
  const { courses } = useCourses();
  const { assignments, reload } = useAssignments();
  const [course, setCourse] = useState('all');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<'due' | 'score' | 'name'>('due');

  const cname = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c.name])), [courses]);

  const rows = assignments.filter((a) => {
    if (course !== 'all' && a.course_id !== course) return false;
    if (filter === 'missing' && !(a.missing && !isSubmitted(a))) return false;
    if (filter === 'late' && !a.late) return false;
    if (filter === 'ungraded' && a.score != null) return false;
    if (filter === 'graded' && a.score == null) return false;
    if (filter === 'unsubmitted' && (isSubmitted(a) || a.excused)) return false;
    if (filter === 'submitted' && !isSubmitted(a)) return false;
    return true;
  }).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'score') {
      const pa = a.score != null && a.points_possible ? a.score / a.points_possible : -1;
      const pb = b.score != null && b.points_possible ? b.score / b.points_possible : -1;
      return pb - pa;
    }
    return (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999');
  });

  return (
    <main>
      <h2>Assignments</h2>
      <div className="toolbar">
        <select value={course} onChange={(e) => setCourse(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="all">All courses</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="all">All statuses</option>
          <option value="unsubmitted">Unsubmitted</option>
          <option value="submitted">Submitted</option>
          <option value="missing">Missing</option>
          <option value="late">Late</option>
          <option value="ungraded">Ungraded</option>
          <option value="graded">Graded</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={{ maxWidth: 160 }}>
          <option value="due">Sort: due date</option>
          <option value="score">Sort: score</option>
          <option value="name">Sort: name</option>
        </select>
        <span className="muted" style={{ fontSize: 13 }}>{rows.length} shown</span>
      </div>
      <Card>
        <table className="data">
          <thead><tr><th>Assignment</th><th>Course</th><th>Category</th><th>Due</th><th>Score</th><th>%</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{cname[a.course_id] ?? '—'}</td>
                <td>{a.category ?? '—'}</td>
                <td>{a.due_at ? new Date(a.due_at).toLocaleDateString() : '—'}</td>
                <td>{a.score == null ? '—' : `${a.score}/${a.points_possible}`}</td>
                <td>{a.score != null && a.points_possible ? `${((a.score / a.points_possible) * 100).toFixed(1)}%` : '—'}</td>
                <td>{statusOf(a)}</td>
                <td><SubmittedToggle a={a} onSaved={reload} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted" style={{ padding: 12 }}>No assignments match these filters.</p>}
      </Card>
    </main>
  );
}
