import type { LMSProvider, NormAssignment, NormCourse } from './types.ts';
import { canvasFetch } from './types.ts';

// Canvas provider. Default host: https://saintignatius.instructure.com
// Uses official REST API: /api/v1/courses, enrollments, assignments, submissions.
export const canvasProvider: LMSProvider = {
  name: 'canvas',

  async testConnection(baseUrl, token) {
    const me = await canvasFetch(baseUrl, token, '/api/v1/users/self');
    return { userName: me.name ?? 'Canvas user' };
  },

  async fetchCourses(baseUrl, token): Promise<NormCourse[]> {
    const courses = await canvasFetch(
      baseUrl, token,
      '/api/v1/courses?enrollment_state=active&enrollment_type=student&include[]=teachers&include[]=total_scores&per_page=100'
    );
    return (Array.isArray(courses) ? courses : []).filter((c) => !c.access_restricted_by_date).map((c) => {
      const enr = (c.enrollments ?? []).find((e: { type?: string }) => e.type === 'student') ?? (c.enrollments ?? [])[0];
      return {
        lmsCourseId: String(c.id),
        name: c.name ?? `Course ${c.id}`,
        courseCode: c.course_code ?? null,
        teachers: (c.teachers ?? []).map((t: { display_name?: string }) => t.display_name).filter(Boolean),
        currentScore: enr?.computed_current_score ?? null,
        currentGrade: enr?.computed_current_grade ?? null,
        pointsPossible: null,
      };
    });
  },

  async fetchAssignments(baseUrl, token, lmsCourseId): Promise<NormAssignment[]> {
    const [assignments, subs] = await Promise.all([
      canvasFetch(baseUrl, token, `/api/v1/courses/${lmsCourseId}/assignments?per_page=100&include[]=submission`),
      canvasFetch(baseUrl, token, `/api/v1/courses/${lmsCourseId}/students/submissions?student_ids[]=self&per_page=100&include[]=assignment`),
    ]);
    const subById: Record<string, Record<string, unknown>> = {};
    for (const s of (Array.isArray(subs) ? subs : [])) subById[String(s.assignment_id)] = s;

    return (Array.isArray(assignments) ? assignments : []).map((a) => {
      const inline = a.submission ?? {};
      const extra = subById[String(a.id)] ?? {};
      const sub = { ...inline, ...extra } as Record<string, unknown>;
      const score = (sub.score ?? null) as number | null;
      const missing = Boolean(sub.missing);
      const late = Boolean(sub.late);
      const excused = Boolean(sub.excused);
      return {
        lmsAssignmentId: String(a.id),
        lmsCourseId: String(lmsCourseId),
        name: a.name ?? `Assignment ${a.id}`,
        category: a.assignment_group?.name ?? null,
        dueAt: a.due_at ?? null,
        pointsPossible: a.points_possible ?? null,
        score,
        grade: (sub.grade ?? null) as string | null,
        missing,
        late,
        excused,
        submittedAt: (sub.submitted_at ?? null) as string | null,
        htmlUrl: a.html_url ?? null,
      };
    });
  },
};
