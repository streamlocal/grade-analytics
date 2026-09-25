import { useEffect, useState } from 'react';
import { fetchSnapshotsForCourses, useCourses } from '../hooks/useData';
import { Card, Skeleton } from '../components/ui';
import { delta, scoreAt } from '../utils/format';
import { letterGrade, overallGpa, qualityPoints, roundedGpaPercent, type CourseLevel } from '../utils/gpa';
import type { Course, CourseSnapshot } from '../models/types';

const LEVELS: CourseLevel[] = ['Regular', 'Honors', 'AP', 'Free'];

function GradeInput({ course, testScore, onChange }: { course: Course; testScore: number | undefined; onChange: (score: number | null) => void }) {
  const [val, setVal] = useState(testScore == null ? '' : String(testScore));
  useEffect(() => {
    setVal(testScore == null ? '' : String(testScore));
  }, [testScore]);

  function commit() {
    const trimmed = val.trim();
    const num = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && (!Number.isFinite(num) || num! < 0 || num! > 150)) {
      setVal(testScore == null ? '' : String(testScore));
      return;
    }
    onChange(num);
  }

  return (
    <span className="row" style={{ gap: 6 }}>
      <input type="number" step="0.01" inputMode="decimal" value={val}
        placeholder={course.current_score == null ? '—' : course.current_score.toFixed(2)}
        onChange={(e) => setVal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ width: 84 }} aria-label={`Grade for ${course.name}`} />
      {testScore != null && (
        <button className="btn ghost" title="Reset to Canvas grade"
          onClick={() => onChange(null)}>↺</button>
      )}
    </span>
  );
}

export default function Compare() {
  const { courses, loading } = useCourses();
  const [snaps, setSnaps] = useState<Record<string, CourseSnapshot[]>>({});
  // Test inputs live only on this page. They never write to courses or affect
  // the Dashboard, and unmounting Compare resets them automatically.
  const [testScores, setTestScores] = useState<Record<string, number>>({});
  const [testLevels, setTestLevels] = useState<Record<string, CourseLevel>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = courses.filter((c) => c.tracked).map((c) => c.id);
    if (!ids.length) return () => { cancelled = true; };
    void fetchSnapshotsForCourses(ids).then((data) => {
        if (cancelled) return;
        const m: Record<string, CourseSnapshot[]> = {};
        for (const s of data) (m[s.course_id] ??= []).push(s);
        setSnaps(m);
      }).catch(() => { if (!cancelled) setSnaps({}); });
    return () => { cancelled = true; };
  }, [courses]);

  function setTestScore(id: string, score: number | null) {
    setTestScores((current) => {
      const next = { ...current };
      if (score == null) delete next[id];
      else next[id] = score;
      return next;
    });
  }

  const scoreFor = (course: Course) => testScores[course.id] ?? course.current_score;
  const levelFor = (course: Course): CourseLevel => testLevels[course.id] ?? course.level ?? 'Regular';

  if (loading) return <main><Skeleton /></main>;
  const tracked = courses.filter((c) => c.tracked);
  const testingGrades = tracked.some((c) => testScores[c.id] != null || testLevels[c.id] != null);
  const gpa = overallGpa(tracked.map((c) => ({ score: scoreFor(c), level: levelFor(c) })));
  const bar = (v: number | null, max = 100) => (
    <div style={{ background: 'var(--bg-soft)', borderRadius: 6, height: 10, minWidth: 120 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, ((v ?? 0) / max) * 100))}%`, height: '100%', borderRadius: 6, background: 'var(--accent)' }} />
    </div>
  );

  return (
    <main>
      <h2>Comparison</h2>
      <Card>
        <h3>{testingGrades ? 'Test GPA' : 'Current Canvas GPA'} — Saint Ignatius scale</h3>
        <p style={{ fontSize: 28, fontWeight: 800 }}>{gpa == null ? '—' : gpa.toFixed(3)}</p>
        <table className="data">
          <thead><tr><th>Course</th><th>Grade %</th><th>GPA uses</th><th>Letter (display)</th><th>Level</th><th>Quality pts</th></tr></thead>
          <tbody>
            {tracked.map((c) => {
              const lvl = levelFor(c);
              const score = scoreFor(c);
              const qp = qualityPoints(score, lvl);
              return (
                <tr key={c.id}>
                  <td>{c.name}{(testScores[c.id] != null || testLevels[c.id] != null) && <span className="muted" title="Temporary test value"> · testing</span>}</td>
                  <td><GradeInput course={c} testScore={testScores[c.id]} onChange={(score) => setTestScore(c.id, score)} /></td>
                  <td>{lvl === 'Free' ? 'excluded' : roundedGpaPercent(score) == null ? '—' : `${roundedGpaPercent(score)}%`}</td>
                  <td>{testScores[c.id] != null ? letterGrade(score) : c.current_grade ?? letterGrade(score)}</td>
                  <td>
                    <select value={lvl} aria-label={`Test course type for ${c.name}`}
                      onChange={(e) => {
                        const selected = e.target.value as CourseLevel;
                        setTestLevels((current) => {
                          const next = { ...current };
                          if (selected === (c.level ?? 'Regular')) delete next[c.id];
                          else next[c.id] = selected;
                          return next;
                        });
                      }} style={{ maxWidth: 130 }}>
                      {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                  <td>{qp == null ? (lvl === 'Free' ? 'excluded' : '—') : qp.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12 }}>
          Type a test grade (blank = use Canvas). Grade and course-type changes here are temporary and reset when you leave Compare. Set your actual course types in Settings; Dashboard and History always show Canvas grades.
          Each course percentage rounds to the nearest whole percent (.5 up) before quality points are assigned. Ignatius scale: 100→4.3 … 65→1.0, below 65→0; Honors +0.25, AP/dual-credit/AP-prereq +0.5. Free periods excluded. The school’s calculator uses semester grades, which may differ from current Canvas grades. Letter labels are display-only; the handbook uses percentages and quality points.
        </p>
      </Card>
      <Card>
        <h3>{testingGrades ? 'Grades in this test' : 'Current Canvas grades'} by course</h3>
        {tracked.map((c) => {
          const s = scoreFor(c);
          return (
            <div key={c.id} className="row" style={{ justifyContent: 'space-between', margin: '6px 0' }}>
              <span style={{ width: 200 }}>{c.name}</span>
              {bar(s)}
              <strong>{s == null ? '—' : `${s.toFixed(1)}%`}</strong>
            </div>
          );
        })}
      </Card>
      <Card>
        <h3>7-day / 30-day change</h3>
        <table className="data">
          <thead><tr><th>Course</th><th>7d</th><th>30d</th></tr></thead>
          <tbody>
            {tracked.map((c) => {
              const s = snaps[c.id] ?? [];
              const d7 = delta(scoreAt(s, 7), c.current_score);
              const d30 = delta(scoreAt(s, 30), c.current_score);
              const f = (d: number | null) => d == null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}`;
              return <tr key={c.id}><td>{c.name}</td><td>{f(d7)}</td><td>{f(d30)}</td></tr>;
            })}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
