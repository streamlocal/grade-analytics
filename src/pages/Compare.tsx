import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { fetchSnapshotsForCourses, useCourses } from '../hooks/useData';
import { Card, Skeleton } from '../components/ui';
import { delta, scoreAt } from '../utils/format';
import { effectiveScore, letterGrade, overallGpa, qualityPoints, roundedGpaPercent, type CourseLevel } from '../utils/gpa';
import type { Course, CourseSnapshot } from '../models/types';

const LEVELS: CourseLevel[] = ['Regular', 'Honors', 'AP', 'Free'];

function GradeInput({ course, onSaved }: { course: Course; onSaved: () => void }) {
  const [val, setVal] = useState(course.score_override != null ? String(course.score_override) : '');
  useEffect(() => {
    setVal(course.score_override != null ? String(course.score_override) : '');
  }, [course.score_override]);

  async function commit() {
    const trimmed = val.trim();
    const num = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && (Number.isNaN(num) || num! < 0 || num! > 150)) return;
    if (num === course.score_override) return;
    await supabase.from('courses').update({ score_override: num }).eq('id', course.id);
    onSaved();
  }

  return (
    <span className="row" style={{ gap: 6 }}>
      <input type="number" step="0.01" inputMode="decimal" value={val}
        placeholder={course.current_score == null ? '—' : course.current_score.toFixed(2)}
        onChange={(e) => setVal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ width: 84 }} aria-label={`Grade for ${course.name}`} />
      {course.score_override != null && (
        <button className="btn ghost" title="Reset to Canvas grade"
          onClick={async () => { await supabase.from('courses').update({ score_override: null }).eq('id', course.id); onSaved(); }}>↺</button>
      )}
    </span>
  );
}

export default function Compare() {
  const { courses, loading, reload } = useCourses();
  const [snaps, setSnaps] = useState<Record<string, CourseSnapshot[]>>({});

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

  async function setLevel(id: string, level: CourseLevel) {
    await supabase.from('courses').update({ level }).eq('id', id);
    reload();
  }

  if (loading) return <main><Skeleton /></main>;
  const tracked = courses.filter((c) => c.tracked);
  const gpa = overallGpa(tracked.map((c) => ({ score: effectiveScore(c), level: c.level ?? 'Regular' })));
  const bar = (v: number | null, max = 100) => (
    <div style={{ background: 'var(--bg-soft)', borderRadius: 6, height: 10, minWidth: 120 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, ((v ?? 0) / max) * 100))}%`, height: '100%', borderRadius: 6, background: 'var(--accent)' }} />
    </div>
  );

  return (
    <main>
      <h2>Comparison</h2>
      <Card>
        <h3>Current GPA — Saint Ignatius scale</h3>
        <p style={{ fontSize: 28, fontWeight: 800 }}>{gpa == null ? '—' : gpa.toFixed(3)}</p>
        <table className="data">
          <thead><tr><th>Course</th><th>Grade %</th><th>GPA uses</th><th>Letter (display)</th><th>Level</th><th>Quality pts</th></tr></thead>
          <tbody>
            {tracked.map((c) => {
              const lvl = (c.level ?? 'Regular') as CourseLevel;
              const score = effectiveScore(c);
              const qp = qualityPoints(score, lvl);
              return (
                <tr key={c.id}>
                  <td>{c.name}{c.score_override != null && <span className="muted" title="Manual override"> · manual</span>}</td>
                  <td><GradeInput course={c} onSaved={reload} /></td>
                  <td>{lvl === 'Free' ? 'excluded' : roundedGpaPercent(score) == null ? '—' : `${roundedGpaPercent(score)}%`}</td>
                  <td>{c.score_override != null ? letterGrade(score) : c.current_grade ?? letterGrade(score)}</td>
                  <td>
                    <select value={lvl} onChange={(e) => setLevel(c.id, e.target.value as CourseLevel)} style={{ maxWidth: 130 }}>
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
          Type a grade to override Canvas (blank = use Canvas). Overrides survive syncs and are marked "manual".
          Each course percentage rounds to the nearest whole percent (.5 up) before quality points are assigned. Ignatius scale: 100→4.3 … 65→1.0, below 65→0; Honors +0.25, AP/dual-credit/AP-prereq +0.5. Free periods excluded. The school’s calculator uses semester grades, which may differ from current Canvas grades. Letter labels are display-only; the handbook uses percentages and quality points.
        </p>
      </Card>
      <Card>
        <h3>Current grade by course</h3>
        {tracked.map((c) => {
          const s = effectiveScore(c);
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
              const d7 = delta(scoreAt(s, 7), effectiveScore(c));
              const d30 = delta(scoreAt(s, 30), effectiveScore(c));
              const f = (d: number | null) => d == null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}`;
              return <tr key={c.id}><td>{c.name}</td><td>{f(d7)}</td><td>{f(d30)}</td></tr>;
            })}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
