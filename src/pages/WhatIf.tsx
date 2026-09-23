import { useEffect, useMemo, useState } from 'react';
import { useAssignments, useCourses } from '../hooks/useData';
import { Card, Empty } from '../components/ui';
import { fmtPct } from '../utils/format';
import type { Assignment, Course } from '../models/types';

interface Hypo { name: string; score: string; points: string; category: string }

// Weighted, category-aware grade estimate. Categories + weights come from Canvas
// (courses.categories); falls back to points-based when no weights are present.
function gradeFrom(stat: Record<string, { e: number; p: number }>, categories: Course['categories']): number | null {
  // Canvas can expose duplicate group names; keep the largest weight per name.
  const byName = new Map<string, number>();
  for (const c of categories ?? []) byName.set(c.name, Math.max(byName.get(c.name) ?? 0, c.weight));
  const weighted = [...byName.entries()].filter(([, w]) => w > 0).map(([name, weight]) => ({ name, weight }));
  if (weighted.length) {
    let num = 0, den = 0;
    for (const c of weighted) {
      const s = stat[c.name];
      if (!s || s.p === 0) continue;
      num += c.weight * (s.e / s.p);
      den += c.weight;
    }
    return den > 0 ? (num / den) * 100 : null;
  }
  let e = 0, p = 0;
  for (const k in stat) { e += stat[k].e; p += stat[k].p; }
  return p > 0 ? (e / p) * 100 : null;
}

function compute(assignments: Assignment[], hypos: Hypo[], categories: Course['categories']) {
  const stat: Record<string, { e: number; p: number }> = {};
  for (const a of assignments) {
    if (a.excused || a.score == null || !a.points_possible) continue;
    const k = a.category ?? 'Uncategorized';
    (stat[k] ??= { e: 0, p: 0 });
    stat[k].e += a.score;
    stat[k].p += a.points_possible;
  }
  const current = gradeFrom(stat, categories);
  const stat2: Record<string, { e: number; p: number }> = {};
  for (const k in stat) stat2[k] = { ...stat[k] };
  for (const h of hypos) {
    const s = parseFloat(h.score), p = parseFloat(h.points);
    if (!Number.isFinite(s) || !Number.isFinite(p) || p <= 0) continue;
    const k = h.category || 'Uncategorized';
    (stat2[k] ??= { e: 0, p: 0 });
    stat2[k].e += s;
    stat2[k].p += p;
  }
  return { current, simulated: gradeFrom(stat2, categories) };
}

export default function WhatIf() {
  const { courses } = useCourses();
  const [courseId, setCourseId] = useState('');
  const { assignments, loading: assignmentsLoading, error: assignmentsError, reload: reloadAssignments } = useAssignments(courseId || null);
  const [hypos, setHypos] = useState<Hypo[]>([{ name: 'Upcoming Test', score: '42', points: '50', category: '' }]);

  const course = courses.find((c) => c.id === courseId);

  // Real Canvas categories (from assignment groups), falling back to categories
  // observed on stored assignments.
  const categoryNames = useMemo(() => {
    const fromCourse = (course?.categories ?? []).map((c) => c.name);
    const fromAssignments = [...new Set(assignments.map((a) => a.category).filter((c): c is string => !!c))];
    return [...new Set([...fromCourse, ...fromAssignments])];
  }, [course, assignments]);

  // Keep hypothetical categories valid when the selected course changes.
  useEffect(() => {
    const preferred = categoryNames.find((c) => /test|exam|quiz|assessment/i.test(c)) ?? categoryNames[0] ?? '';
    setHypos((hs) => hs.map((h) => categoryNames.includes(h.category) ? h : {
      ...h,
      category: preferred,
    }));
  }, [categoryNames.join('|')]);

  const result = useMemo(
    () => (course && !assignmentsLoading && !assignmentsError ? compute(assignments, hypos, course.categories ?? []) : null),
    [course, assignments, hypos, assignmentsLoading, assignmentsError]
  );

  const weighted = (course?.categories ?? []).some((c) => c.weight > 0);

  return (
    <main>
      <h2>What-if simulator <span className="muted" style={{ fontSize: 13 }}>(SIMULATED — never sent to Canvas)</span></h2>
      <Card>
        <label>Course
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Select…</option>
            {courses.filter((c) => c.tracked).map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {fmtPct(c.current_score)}</option>
            ))}
          </select>
        </label>

        {course && assignmentsError && <p className="error" role="alert">Could not load this course’s assignments: {assignmentsError} <button type="button" className="btn" onClick={reloadAssignments}>Try again</button></p>}

        {course && categoryNames.length > 0 && (
          <p className="muted" style={{ fontSize: 12 }}>
            Categories from Canvas: {categoryNames.join(', ')}
            {weighted ? ' · weighted grading detected' : ' · points-based'}
          </p>
        )}

        {hypos.map((h, i) => (
          <div key={i} className="row">
            <input style={{ flex: 2 }} value={h.name} placeholder="Assignment name"
              onChange={(e) => setHypos(hypos.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <select style={{ flex: 1.4 }} value={h.category}
              onChange={(e) => setHypos(hypos.map((x, j) => j === i ? { ...x, category: e.target.value } : x))}>
              {!categoryNames.length && <option value="">Uncategorized</option>}
              {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input style={{ flex: 1 }} value={h.score} placeholder="Score" inputMode="decimal"
              onChange={(e) => setHypos(hypos.map((x, j) => j === i ? { ...x, score: e.target.value } : x))} />
            <span>/</span>
            <input style={{ flex: 1 }} value={h.points} placeholder="Points" inputMode="decimal"
              onChange={(e) => setHypos(hypos.map((x, j) => j === i ? { ...x, points: e.target.value } : x))} />
            <button className="btn ghost" onClick={() => setHypos(hypos.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => setHypos([...hypos, { name: '', score: '', points: '', category: categoryNames[0] ?? '' }])}>
            Add hypothetical
          </button>
        </div>
      </Card>

      <Card>
        {!course ? <Empty title="Select a course to simulate" /> : assignmentsLoading ? <p className="muted">Loading assignments…</p> : assignmentsError ? <Empty title="Simulation unavailable" hint="Reload the course’s assignments and try again." /> : !result ? null : (
          <>
            <p>Current grade: <strong>{result.current == null ? '—' : `${result.current.toFixed(2)}%`}</strong></p>
            <p>Simulated grade: <strong>{result.simulated == null ? '—' : `${result.simulated.toFixed(2)}%`}</strong></p>
            {result.current != null && result.simulated != null && (
              <p className={Math.abs(result.simulated - result.current) < 0.005 ? 'delta-flat' : result.simulated > result.current ? 'delta-up' : 'delta-down'}>
                Change: {result.simulated - result.current >= 0 ? '+' : ''}{(result.simulated - result.current).toFixed(2)} points
              </p>
            )}
            <p className="muted" style={{ fontSize: 13 }}>
              {weighted
                ? 'Uses Canvas category weights for this course.'
                : 'Points-based estimate — this course has no Canvas category weights.'}
              {' '}Hypothetical scores never leave your browser.
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
