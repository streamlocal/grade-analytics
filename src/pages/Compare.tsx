import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useCourses } from '../hooks/useData';
import { Card, Skeleton } from '../components/ui';
import { delta, scoreAt } from '../utils/format';
import { letterGrade, overallGpa, qualityPoints, type CourseLevel } from '../utils/gpa';
import type { CourseSnapshot } from '../models/types';

const LEVELS: CourseLevel[] = ['Regular', 'Honors', 'AP', 'Free'];

export default function Compare() {
  const { courses, loading, reload } = useCourses();
  const [snaps, setSnaps] = useState<Record<string, CourseSnapshot[]>>({});

  useEffect(() => {
    const ids = courses.filter((c) => c.tracked).map((c) => c.id);
    if (!ids.length) return;
    supabase.from('course_snapshots').select('*').in('course_id', ids).order('created_at')
      .then(({ data }) => {
        const m: Record<string, CourseSnapshot[]> = {};
        for (const s of (data ?? []) as CourseSnapshot[]) (m[s.course_id] ??= []).push(s);
        setSnaps(m);
      });
  }, [courses]);

  async function setLevel(id: string, level: CourseLevel) {
    await supabase.from('courses').update({ level }).eq('id', id);
    reload();
  }

  if (loading) return <main><Skeleton /></main>;
  const tracked = courses.filter((c) => c.tracked);
  const gpa = overallGpa(tracked.map((c) => ({ score: c.current_score, level: c.level ?? 'Regular' })));
  const bar = (v: number | null, max = 100) => (
    <div style={{ background: 'var(--bg-soft)', borderRadius: 6, height: 10, minWidth: 120 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, ((v ?? 0) / max) * 100))}%`, height: '100%', borderRadius: 6, background: 'var(--accent)' }} />
    </div>
  );

  return (
    <main>
      <h2>Comparison</h2>
      <Card>
        <h3>GPA — Saint Ignatius scale</h3>
        <p style={{ fontSize: 28, fontWeight: 800 }}>{gpa == null ? '—' : gpa.toFixed(2)}</p>
        <table className="data">
          <thead><tr><th>Course</th><th>%</th><th>Letter</th><th>Level</th><th>Quality pts</th></tr></thead>
          <tbody>
            {tracked.map((c) => {
              const lvl = (c.level ?? 'Regular') as CourseLevel;
              const qp = qualityPoints(c.current_score, lvl);
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.current_score == null ? '—' : c.current_score.toFixed(1)}</td>
                  <td>{c.current_grade ?? letterGrade(c.current_score)}</td>
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
          Ignatius scale: percentage → quality points (100→4.3 … 65→1.0, below 65→0);
          Honors +0.25, AP / dual-credit / AP-prerequisite +0.5. Free periods excluded.
          No class rank is published — this GPA is personal only.
        </p>
      </Card>
      <Card>
        <h3>Current grade by course</h3>
        {tracked.map((c) => (
          <div key={c.id} className="row" style={{ justifyContent: 'space-between', margin: '6px 0' }}>
            <span style={{ width: 200 }}>{c.name}</span>
            {bar(c.current_score)}
            <strong>{c.current_score == null ? '—' : `${c.current_score.toFixed(1)}%`}</strong>
          </div>
        ))}
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
