import { useMemo, useState } from 'react';
import { useAssignments, useCourses } from '../hooks/useData';
import { Card, Empty } from '../components/ui';
import { fmtPct } from '../utils/format';

// What-if simulator: client-side only, never sent to the LMS.
// Estimates with category weights when available; otherwise points-based.
export default function WhatIf() {
  const { courses } = useCourses();
  const [courseId, setCourseId] = useState('');
  const { assignments } = useAssignments(courseId || undefined);
  const [hypos, setHypos] = useState<{ name: string; score: string; points: string }[]>([
    { name: 'Upcoming Test', score: '42', points: '50' },
  ]);

  const course = courses.find((c) => c.id === courseId);

  const estimate = useMemo(() => {
    if (!course) return null;
    let earned = 0, possible = 0;
    for (const a of assignments) {
      if (a.excused || a.score == null || !a.points_possible) continue;
      earned += a.score; possible += a.points_possible;
    }
    let hE = 0, hP = 0;
    for (const h of hypos) {
      const s = parseFloat(h.score), p = parseFloat(h.points);
      if (Number.isFinite(s) && Number.isFinite(p) && p > 0) { hE += s; hP += p; }
    }
    if (possible + hP === 0) return null;
    return {
      current: possible ? (earned / possible) * 100 : null,
      simulated: ((earned + hE) / (possible + hP)) * 100,
      approximate: true,
    };
  }, [assignments, course, hypos]);

  return (
    <main>
      <h2>What-if simulator <span className="muted" style={{ fontSize: 13 }}>(SIMULATED — not sent to Canvas)</span></h2>
      <Card>
        <label>Course
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Select…</option>
            {courses.filter((c) => c.tracked).map((c) => <option key={c.id} value={c.id}>{c.name} — {fmtPct(c.current_score)}</option>)}
          </select>
        </label>
        {hypos.map((h, i) => (
          <div key={i} className="row">
            <input style={{ flex: 2 }} value={h.name} onChange={(e) => setHypos(hypos.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Assignment name" />
            <input style={{ flex: 1 }} value={h.score} onChange={(e) => setHypos(hypos.map((x, j) => j === i ? { ...x, score: e.target.value } : x))} placeholder="Score" inputMode="decimal" />
            <span>/</span>
            <input style={{ flex: 1 }} value={h.points} onChange={(e) => setHypos(hypos.map((x, j) => j === i ? { ...x, points: e.target.value } : x))} placeholder="Points" inputMode="decimal" />
            <button className="btn ghost" onClick={() => setHypos(hypos.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => setHypos([...hypos, { name: '', score: '', points: '' }])}>Add hypothetical</button>
        </div>
      </Card>
      <Card>
        {!estimate ? <Empty title="Select a course to simulate" /> : (
          <>
            <p>Current (points-based): <strong>{estimate.current == null ? '—' : `${estimate.current.toFixed(1)}%`}</strong></p>
            <p>Simulated: <strong>{estimate.simulated.toFixed(1)}%</strong></p>
            <p className="muted" style={{ fontSize: 13 }}>Approximate estimate — Canvas category weights may differ. Hypothetical scores never leave your browser.</p>
          </>
        )}
      </Card>
    </main>
  );
}
