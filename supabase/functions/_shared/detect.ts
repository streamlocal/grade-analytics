// Structured change detection: compare latest LMS state vs previous DB state,
// emit GRADE_CHANGED / ASSIGNMENT_* / DUE_DATE_CHANGED events + human messages.

export interface ChangeEvent {
  type: string;
  courseId: string | null;
  assignmentId: string | null;
  title: string;
  message: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}

// Normalizers: Postgres returns numerics/timestamps in formats that differ
// textually from the LMS (e.g. "+00:00" vs "Z"). Compare by value, not string.
function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function timeOf(v: unknown): number | null {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  return Number.isNaN(t) ? null : t;
}

export function detectCourseGradeChange(
  courseName: string, courseId: string,
  oldScore: number | null, newScore: number | null
): ChangeEvent | null {
  const o = num(oldScore), n = num(newScore);
  if (o == null || n == null) return null;
  if (Math.abs(n - o) < 0.05) return null;
  const dir = n > o ? 'increased' : 'decreased';
  return {
    type: 'GRADE_CHANGED', courseId, assignmentId: null,
    title: `${courseName} ${o.toFixed(1)} → ${n.toFixed(1)}%`,
    message: `${courseName} ${dir} from ${o.toFixed(1)}% to ${n.toFixed(1)}%.`,
    oldValue: { score: o }, newValue: { score: n },
  };
}

export interface PrevAssign {
  id: string;
  name: string;
  score: number | null;
  points: number | null;
  missing: boolean;
  dueAt: string | null;
}

export interface NextAssign extends PrevAssign {
  key: string; // `${courseId}:${lmsAssignmentId}`
  courseId: string;
  courseName: string;
}

export function detectAssignmentChanges(prev: Map<string, PrevAssign>, next: NextAssign[]): ChangeEvent[] {
  const out: ChangeEvent[] = [];
  const seen = new Set<string>();

  for (const n of next) {
    seen.add(n.key);
    const p = prev.get(n.key);
    if (!p) {
      out.push({
        type: 'ASSIGNMENT_ADDED', courseId: n.courseId, assignmentId: n.id,
        title: `New assignment: ${n.name}`,
        message: `${n.courseName}: new assignment "${n.name}" was added.`,
        oldValue: null, newValue: { score: n.score },
      });
      continue;
    }
    const pScore = num(p.score), nScore = num(n.score);
    if (pScore == null && nScore != null) {
      out.push({
        type: 'ASSIGNMENT_GRADED', courseId: n.courseId, assignmentId: n.id,
        title: `${n.name} graded ${n.score}/${n.points}`,
        message: `${n.courseName}: "${n.name}" was graded ${n.score}/${n.points}.`,
        oldValue: { score: null }, newValue: { score: n.score },
      });
    } else if (pScore != null && nScore != null && pScore !== nScore) {
      out.push({
        type: 'ASSIGNMENT_SCORE_CHANGED', courseId: n.courseId, assignmentId: n.id,
        title: `${n.name} score changed ${p.score} → ${n.score}`,
        message: `${n.courseName}: "${n.name}" changed from ${p.score}/${p.points} to ${n.score}/${n.points}.`,
        oldValue: { score: p.score }, newValue: { score: n.score },
      });
    }
    if (p.missing && !n.missing) {
      out.push({
        type: 'ASSIGNMENT_SUBMITTED', courseId: n.courseId, assignmentId: n.id,
        title: `Previously missing "${n.name}" was submitted`,
        message: `A previously missing ${n.courseName} assignment ("${n.name}") was submitted.`,
        oldValue: { missing: true }, newValue: { missing: false },
      });
    } else if (!p.missing && n.missing) {
      out.push({
        type: 'ASSIGNMENT_BECAME_MISSING', courseId: n.courseId, assignmentId: n.id,
        title: `"${n.name}" is now missing`,
        message: `${n.courseName}: "${n.name}" became missing.`,
        oldValue: { missing: false }, newValue: { missing: true },
      });
    }
    if (timeOf(p.dueAt) !== timeOf(n.dueAt) && n.dueAt) {
      out.push({
        type: 'DUE_DATE_CHANGED', courseId: n.courseId, assignmentId: n.id,
        title: `"${n.name}" due date changed`,
        message: `${n.courseName}: "${n.name}" due date changed to ${new Date(n.dueAt).toLocaleDateString()}.`,
        oldValue: { dueAt: p.dueAt }, newValue: { dueAt: n.dueAt },
      });
    }
  }
  for (const [key, p] of prev) {
    if (!seen.has(key)) {
      out.push({
        type: 'ASSIGNMENT_REMOVED', courseId: null, assignmentId: p.id,
        title: `Assignment removed: ${p.name}`,
        message: `"${p.name}" was removed from the LMS. History preserved.`,
        oldValue: { name: p.name }, newValue: null,
      });
    }
  }
  return out;
}
