import { useMemo, useState } from 'react';
import { useAssignments, useCourses } from '../hooks/useData';
import { Card } from '../components/ui';
import type { Assignment } from '../models/types';

function statusOf(a: Assignment): string {
  if (a.excused) return 'Excused';
  if (a.missing) return 'Missing';
  if (a.late) return 'Late';
  if (a.submitted_at) return a.score == null ? 'Submitted' : 'Graded';
  return 'Unsubmitted';
}

export default function Assignments() {
  const { courses } = useCourses();
  const { assignments } = useAssignments();
  const [course, setCourse] = useState('all');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<'due' | 'score' | 'name'>('due');

  const cname = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c.name])), [courses]);

  const rows = assignments.filter((a) => {
    if (course !== 'all' && a.course_id !== course) return false;
    if (filter === 'missing' && !a.missing) return false;
    if (filter === 'late' && !a.late) return false;
    if (filter === 'ungraded' && a.score != null) return false;
    if (filter === 'graded' && a.score == null) return false;
    if (filter === 'unsubmitted' && (a.submitted_at != null || a.excused)) return false;
    if (filter === 'submitted' && a.submitted_at == null) return false;
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
      </div>
      <Card>
        <table className="data">
          <thead><tr><th>Assignment</th><th>Course</th><th>Category</th><th>Due</th><th>Score</th><th>%</th><th>Status</th></tr></thead>
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
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
