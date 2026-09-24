import type { Course, CourseSnapshot, SyncRun } from '../models/types';
import { overallGpa } from './gpa';

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
  return points;
}
