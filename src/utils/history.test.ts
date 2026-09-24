import { describe, expect, it } from 'vitest';
import { buildGpaTimeline, collapseUnchangedSnapshots } from './history';
import type { Course, CourseSnapshot, SyncRun } from '../models/types';

const base = '2026-09-22T12:00:00Z';
const iso = (minute: number) => new Date(Date.parse(base) + minute * 60_000).toISOString();
const course = (id: string): Course => ({ id, lms_course_id: id, name: id, course_code: null,
  teacher_names: [], current_score: null, current_grade: null, points_possible: null, tracked: true,
  level: 'Regular', score_override: null, categories: [] });
const snap = (id: string, minute: number, score: number): CourseSnapshot => ({ id: `${id}-${minute}`, course_id: id,
  score, grade: null, points_possible: null, created_at: iso(minute) });
const run = (minute: number): SyncRun => ({ id: String(minute), status: 'complete', stage: 'Complete', error: null,
  started_at: iso(minute - 4), finished_at: iso(minute) });

describe('GPA history', () => {
  it('plots only completed, full-course syncs and connects later changes', () => {
    const points = buildGpaTimeline([course('a'), course('b')], [
      snap('a', 1, 100), snap('b', 2, 80), snap('a', 1442, 90), snap('b', 1443, 80),
    ], [run(1), run(3), run(1444)]);
    expect(points).toHaveLength(2);
    expect(points.map((point) => point.t)).toEqual([iso(3), iso(1444)]);
    expect(points[0].score).toBeGreaterThan(points[1].score);
  });
  it('compares timestamps by instant, not by timezone-string order', () => {
    const first = snap('a', 1, 95);
    first.created_at = first.created_at.replace('Z', '+00:00');
    expect(buildGpaTimeline([course('a')], [first], [run(2)])).toHaveLength(1);
  });
  it('merges unchanged snapshots while keeping every grade change', () => {
    const snapshots = [snap('a', 1, 95), snap('a', 10, 95), snap('a', 15, 96), snap('a', 60, 96)];
    const collapsed = collapseUnchangedSnapshots(snapshots);
    expect(collapsed).toHaveLength(3);
    expect(collapsed.map((point) => point.score)).toEqual([95, 96, 96]);
    expect(collapsed.map((point) => point.created_at)).toEqual([iso(1), iso(15), iso(60)]);
  });
  it('keeps both endpoints for a course whose grade never changed', () => {
    const collapsed = collapseUnchangedSnapshots([snap('a', 1, 95), snap('a', 10, 95), snap('a', 60, 95)]);
    expect(collapsed.map((point) => point.created_at)).toEqual([iso(1), iso(60)]);
  });
});
