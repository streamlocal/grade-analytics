import type { Assignment, Course } from '../models/types';
import { overallGpa } from './gpa';

function gradeFrom(rows: Assignment[], categories: Course['categories'], extra?: { category: string; score: number; possible: number }): number | null {
  const totals = new Map<string, { score: number; possible: number }>();
  for (const row of rows) {
    if (row.excused || row.score == null || !row.points_possible) continue;
    const key = row.category ?? 'Uncategorized';
    const previous = totals.get(key) ?? { score: 0, possible: 0 };
    totals.set(key, { score: previous.score + row.score, possible: previous.possible + row.points_possible });
  }
  if (extra) {
    const previous = totals.get(extra.category) ?? { score: 0, possible: 0 };
    totals.set(extra.category, { score: previous.score + extra.score, possible: previous.possible + extra.possible });
  }
  const weights = new Map<string, number>();
  for (const category of categories ?? []) weights.set(category.name, Math.max(weights.get(category.name) ?? 0, category.weight));
  if ([...weights.values()].some((weight) => weight > 0)) {
    let numerator = 0, denominator = 0;
    for (const [name, weight] of weights) {
      const total = totals.get(name);
      if (!total?.possible || weight <= 0) continue;
      numerator += weight * total.score / total.possible;
      denominator += weight;
    }
    return denominator ? numerator / denominator * 100 : null;
  }
  const values = [...totals.values()];
  const possible = values.reduce((sum, value) => sum + value.possible, 0);
  return possible ? values.reduce((sum, value) => sum + value.score, 0) / possible * 100 : null;
}

export function previewAssignment(assignment: Assignment, course: Course, allAssignments: Assignment[], courses: Course[], fraction: number) {
  if (!assignment.points_possible || assignment.points_possible <= 0 || course.current_score == null) return null;
  const rows = allAssignments.filter((row) => row.course_id === course.id);
  const baseline = gradeFrom(rows, course.categories);
  const simulated = gradeFrom(rows, course.categories, {
    category: assignment.category ?? 'Uncategorized',
    score: assignment.points_possible * fraction,
    possible: assignment.points_possible,
  });
  if (baseline == null || simulated == null) return null;
  const courseScore = Math.max(0, course.current_score + simulated - baseline);
  const gpa = overallGpa(courses.filter((row) => row.tracked).map((row) => ({
    score: row.id === course.id ? courseScore : row.current_score,
    level: row.level ?? 'Regular',
  })));
  return { courseScore, gpa };
}
