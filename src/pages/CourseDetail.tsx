import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAssignments, useCourses } from '../hooks/useData';
import { useSnapshots } from '../hooks/useData';
import { supabase } from '../services/supabaseClient';
import { Card, Empty, Skeleton } from '../components/ui';
import { HistoryChart } from '../charts/charts';
import { fmtPct, letterFor, isSubmitted } from '../utils/format';
import { qualityPoints, effectiveScore, type CourseLevel } from '../utils/gpa';

export default function CourseDetail() {
  const { id } = useParams();
  const { courses, loading } = useCourses();
  const course = useMemo(() => courses.find((c) => c.id === id), [courses, id]);
  const snaps = useSnapshots(id ?? null);
  const { assignments } = useAssignments(id);
  const [range, setRange] = useState<'7D' | '30D' | 'Q' | 'S' | 'ALL'>('30D');
  const [level, setLevel] = useState<CourseLevel>('Regular');
  useEffect(() => {
    if (course?.level) setLevel(course.level as CourseLevel);
  }, [course?.level]);

  async function changeLevel(v: CourseLevel) {
    setLevel(v);
    if (id) await supabase.from('courses').update({ level: v }).eq('id', id);
  }

  if (loading) return <main><Skeleton /></main>;
  if (!course) return <main><Empty title="Course not found" /></main>;

  const days = range === '7D' ? 7 : range === '30D' ? 30 : range === 'Q' ? 90 : range === 'S' ? 180 : 10000;
  const cutoff = Date.now() - days * 86400_000;
  const pts = snaps.filter((s) => new Date(s.created_at).getTime() >= cutoff)
    .map((s) => ({ t: s.created_at, score: s.score }));
  const scores = snaps.map((s) => s.score).filter((v): v is number => v != null);
  const hi = scores.length ? Math.max(...scores) : null;
  const lo = scores.length ? Math.min(...scores) : null;

  const cats: Record<string, { total: number; n: number }> = {};
  for (const a of assignments) {
    if (a.score == null || !a.points_possible) continue;
    const k = a.category ?? 'Uncategorized';
    cats[k] ??= { total: 0, n: 0 };
    cats[k].total += (a.score / a.points_possible) * 100;
    cats[k].n += 1;
  }

  return (
    <main>
      <h2>{course.name}</h2>
      <p className="muted">{course.course_code} · {(course.teacher_names ?? []).join(', ')}</p>
      <div className="row">
        <label style={{ maxWidth: 220 }}>Class level (GPA weight)
          <select value={level} onChange={(e) => changeLevel(e.target.value as CourseLevel)}>
            <option value="Regular">Regular (+0)</option>
            <option value="Honors">Honors (+0.25)</option>
            <option value="AP">AP / dual-credit / AP-prereq (+0.5)</option>
            <option value="Free">Free period (excluded)</option>
          </select>
        </label>
        <span className="muted">Quality points: <strong>{qualityPoints(effectiveScore(course), level)?.toFixed(2) ?? '—'}</strong></span>
      </div>
      <div className="grid stats">
        <Card><div className="stat"><div className="l">Current</div><div className="v">{fmtPct(effectiveScore(course))} {course.score_override != null ? letterFor(effectiveScore(course)) : course.current_grade ?? letterFor(effectiveScore(course))}</div></div></Card>
        <Card><div className="stat"><div className="l">Highest</div><div className="v">{fmtPct(hi)}</div></div></Card>
        <Card><div className="stat"><div className="l">Lowest</div><div className="v">{fmtPct(lo)}</div></div></Card>
        <Card><div className="stat"><div className="l">Missing</div><div className="v">{assignments.filter((a) => a.missing && !a.excused && !isSubmitted(a)).length}</div></div></Card>
      </div>
      <Card>
        <div className="toolbar">
          {(['7D', '30D', 'Q', 'S', 'ALL'] as const).map((r) => (
            <button key={r} className={`btn ${range === r ? 'primary' : ''}`} onClick={() => setRange(r)}>{r === 'Q' ? 'Quarter' : r === 'S' ? 'Semester' : r}</button>
          ))}
        </div>
        <HistoryChart points={pts} />
        <p className="muted" style={{ fontSize: 12 }}>Hover a point for date, exact grade, and change. Grade is from Canvas; category weighting is approximate when Canvas omits weights.</p>
      </Card>
      <h3>Category averages</h3>
      <div className="grid stats">
        {Object.entries(cats).map(([k, v]) => (
          <Card key={k}><div className="stat"><div className="l">{k}</div><div className="v">{(v.total / v.n).toFixed(1)}%</div></div></Card>
        ))}
        {!Object.keys(cats).length && <Empty title="No graded assignments yet" />}
      </div>
      <h3>Assignments</h3>
      <Card>
        <table className="data">
          <thead><tr><th>Name</th><th>Due</th><th>Score</th><th>Status</th></tr></thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id}>
                <td>{a.html_url ? <a href={a.html_url} target="_blank" rel="noreferrer">{a.name}</a> : a.name}</td>
                <td>{a.due_at ? new Date(a.due_at).toLocaleDateString() : '—'}</td>
                <td>{a.score == null ? 'Ungraded' : `${a.score}/${a.points_possible}`}</td>
                <td>{a.excused ? 'Excused' : a.missing && !isSubmitted(a) ? 'Missing' : a.score != null ? 'Graded' : isSubmitted(a) ? 'Submitted' : a.late ? 'Late' : 'Unsubmitted'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
