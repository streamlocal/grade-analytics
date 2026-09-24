import type { Course, CourseSnapshot, SyncRun } from '../models/types';
import { overallGpa } from './gpa';

// The chart represents grade history, not the number of times the refresh
// button was pressed. Preserve the baseline, every actual change, and the
// latest endpoint. That gives unchanged courses a visible horizontal line and
// changed courses a complete path without a dot for every redundant sync.
export function collapseUnchangedSnapshots(snapshots: CourseSnapshot[]): CourseSnapshot[] {
  const byCourse = new Map<string, CourseSnapshot[]>();
  for (const snapshot of [...snapshots].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    const series = byCourse.get(snapshot.course_id) ?? [];
    series.push(snapshot);
    byCourse.set(snapshot.course_id, series);
  }
  const compact = [...byCourse.values()].flatMap((series) => {
    if (series.length <= 2) return series;
    const kept = [series[0]];
    for (let index = 1; index < series.length; index++) {
      if (series[index].score !== series[index - 1].score) kept.push(series[index]);
    }
    const latest = series[series.length - 1];
    if (kept[kept.length - 1].id !== latest.id) kept.push(latest);
    return kept;
  });
  return compact.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

export function collapseUnchangedPoints(points: { t: string; score: number }[]): { t: string; score: number }[] {
  const ordered = [...points].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  if (ordered.length <= 2) return ordered;
  const compact = [ordered[0]];
  for (let index = 1; index < ordered.length; index++) {
    if (ordered[index].score !== ordered[index - 1].score) compact.push(ordered[index]);
  }
  const latest = ordered[ordered.length - 1];
  if (compact[compact.length - 1].t !== latest.t) compact.push(latest);
  return compact;
}

export function buildGpaTimeline(courses: Course[], snapshots: CourseSnapshot[], runs: SyncRun[]): { t: string; score: number }[] {
  const tracked = courses.filter((course) => course.tracked);
  if (!tracked.length) return [];
  const ids = new Set(tracked.map((course) => course.id));
  const orderedSnapshots = snapshots.filter((snapshot) => ids.has(snapshot.course_id))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const completedRuns = runs.filter((run) => run.status === 'complete' && run.finished_at)
    .sort((a, b) => Date.parse(a.finished_at!) - Date.parse(b.finished_at!));
  const latest = new Map<string, number | null>();
  const points: { t: string; score: number }[] = [];
  let index = 0;
  for (const run of completedRuns) {
    const time = run.finished_at!;
    const runTime = Date.parse(time);
    while (index < orderedSnapshots.length && Date.parse(orderedSnapshots[index].created_at) <= runTime) {
      const snapshot = orderedSnapshots[index++];
      latest.set(snapshot.course_id, snapshot.score);
    }
    // Earlier snapshots may contain only one or two classes. A partial GPA
    // isn't comparable with the student's full course load, so omit it.
    if (latest.size !== tracked.length) continue;
    const score = overallGpa(tracked.map((course) => ({ score: latest.get(course.id) ?? null, level: course.level ?? 'Regular' })));
    if (score != null) points.push({ t: time, score });
  }
  return collapseUnchangedPoints(points);
}
