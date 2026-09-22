// sync: discover courses, set tracked, or run a full synchronization.
// Modes: { mode: 'discover' } | { mode: 'set-tracked', course_ids } | { mode: 'sync' }
// Service-role callers (cron-trigger) may pass { for_user } to sync without a user JWT.
import { adminClient, requireUser, decryptCredential, json } from '../_shared/auth.ts';
import { preflight } from '../_shared/cors.ts';
import { getProvider } from '../_shared/providers/index.ts';
import { detectCourseGradeChange, detectAssignmentChanges, type NextAssign } from '../_shared/detect.ts';

async function resolveUser(req: Request, body: Record<string, unknown>) {
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (body.for_user && auth === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return { userId: String(body.for_user), admin: adminClient() };
  }
  const { user, admin } = await requireUser(req);
  return { userId: user.id, admin };
}

// Best-effort initial course level from the Canvas course name.
// A user can override this later; it is only applied on first insert.
function detectLevel(name: string): 'Regular' | 'Honors' | 'AP' | 'Free' {
  const n = (name ?? '').toLowerCase();
  if (/\bfree (period|block)\b/.test(n)) return 'Free';
  if (/(^|\W)(ap|advanced placement)(\W|$)/.test(n)) return 'AP';
  if (/\bhonors?\b/.test(n)) return 'Honors';
  return 'Regular';
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const body = await req.json().catch(() => ({}));
  let userId, admin;
  try {
    ({ userId, admin } = await resolveUser(req, body));
  } catch (e) {
    return e as Response;
  }
  const mode = body.mode ?? 'sync';

  // ---- discover: list LMS courses, upsert shell rows, return them ----
  if (mode === 'discover') {
    try {
      const { cred, token } = await decryptCredential(admin, userId);
      const courses = await getProvider(cred.provider).fetchCourses(cred.base_url, token);
      const { data: existing } = await admin.from('courses').select('lms_course_id').eq('user_id', userId);
      const known = new Set(((existing ?? []) as { lms_course_id: string }[]).map((c) => c.lms_course_id));
      for (const c of courses) {
        const row: Record<string, unknown> = {
          user_id: userId, lms_course_id: c.lmsCourseId, name: c.name,
          course_code: c.courseCode, teacher_names: c.teachers,
          current_score: c.currentScore, current_grade: c.currentGrade,
          updated_at: new Date().toISOString(),
        };
        // Seed a sensible level for brand-new courses; never overwrite a user's choice.
        if (!known.has(c.lmsCourseId)) row.level = detectLevel(c.name);
        await admin.from('courses').upsert(row, { onConflict: 'user_id,lms_course_id' });
      }
      const { data } = await admin.from('courses').select('lms_course_id,name,tracked').eq('user_id', userId);
      return json({ courses: data ?? [] });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Discovery failed' }, 502);
    }
  }

  // ---- set-tracked ----
  if (mode === 'set-tracked') {
    const ids: string[] = body.course_ids ?? [];
    const { data: all } = await admin.from('courses').select('id,lms_course_id').eq('user_id', userId);
    for (const c of all ?? []) {
      const tracked = ids.includes((c as { lms_course_id: string }).lms_course_id);
      await admin.from('courses').update({ tracked }).eq('id', (c as { id: string }).id);
    }
    return json({ ok: true, tracked: ids });
  }

  // ---- full sync (locked: one running job per user) ----
  const { data: existing } = await admin.from('sync_runs').select('id')
    .eq('user_id', userId).eq('status', 'running').limit(1);
  if (existing?.length) return json({ error: 'A sync is already running for this account.' }, 409);

  const { data: run } = await admin.from('sync_runs')
    .insert({ user_id: userId, status: 'running', stage: 'Connecting' }).select('id').single();
  const runId = (run as { id: string } | null)?.id;
  const setStage = (stage: string) =>
    runId ? admin.from('sync_runs').update({ stage }).eq('id', runId) : Promise.resolve();

  try {
    const { cred, token } = await decryptCredential(admin, userId);
    const provider = getProvider(cred.provider);

    await setStage('Fetching courses');
    const lmsCourses = await provider.fetchCourses(cred.base_url, token);

    // Previous state for change detection.
    const { data: prevCourses } = await admin.from('courses').select('*').eq('user_id', userId);
    const prevByLms = new Map(((prevCourses ?? []) as Record<string, unknown>[]).map((c) => [
      (c as { lms_course_id: string }).lms_course_id, c as { id: string; current_score: number | null; name: string },
    ]));

    await setStage('Fetching assignments');
    const events: unknown[] = [];

    for (const lc of lmsCourses) {
      const prev = prevByLms.get(lc.lmsCourseId);
      // Only set an initial level for brand-new courses so a user's manual
      // Honors/AP/Free choice is never overwritten on later syncs.
      const courseRow: Record<string, unknown> = {
        user_id: userId, lms_course_id: lc.lmsCourseId, name: lc.name,
        course_code: lc.courseCode, teacher_names: lc.teachers,
        current_score: lc.currentScore, current_grade: lc.currentGrade,
        updated_at: new Date().toISOString(),
      };
      if (!prev) courseRow.level = detectLevel(lc.name);
      const { data: up } = await admin.from('courses').upsert(courseRow, { onConflict: 'user_id,lms_course_id' })
        .select('id,tracked').single();
      const courseId = (up as { id: string } | null)?.id;
      const tracked = (up as { tracked: boolean } | null)?.tracked ?? true;
      if (!courseId || !tracked) continue;

      const gEvent = detectCourseGradeChange(lc.name, courseId, prev?.current_score ?? null, lc.currentScore);
      if (gEvent && prev) {
        events.push({ user_id: userId, ...gEvent, old_value: gEvent.oldValue, new_value: gEvent.newValue });
      }
      await admin.from('course_snapshots').insert({
        user_id: userId, course_id: courseId,
        score: lc.currentScore, grade: lc.currentGrade,
      });

      // Assignments for this course.
      let lmsAssign: Awaited<ReturnType<typeof provider.fetchAssignments>> = [];
      try {
        lmsAssign = await provider.fetchAssignments(cred.base_url, token, lc.lmsCourseId);
      } catch {
        continue; // partial failure: keep previous assignment data for this course
      }
      const { data: prevAssign } = await admin.from('assignments').select('*').eq('course_id', courseId);
      const prevMap = new Map(((prevAssign ?? []) as Record<string, unknown>[]).map((a) => {
        const r = a as { id: string; lms_assignment_id: string; name: string; score: number | null; points_possible: number | null; missing: boolean; due_at: string | null };
        return [`${courseId}:${r.lms_assignment_id}`, { id: r.id, name: r.name, score: r.score, points: r.points_possible, missing: r.missing, dueAt: r.due_at }];
      }));

      const nextList: NextAssign[] = [];
      for (const la of lmsAssign) {
        const { data: row } = await admin.from('assignments').upsert({
          user_id: userId, course_id: courseId, lms_assignment_id: la.lmsAssignmentId,
          name: la.name, category: la.category, due_at: la.dueAt,
          points_possible: la.pointsPossible, score: la.score, grade: la.grade,
          missing: la.missing, late: la.late, excused: la.excused,
          submitted_at: la.submittedAt, html_url: la.htmlUrl,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'course_id,lms_assignment_id' }).select('id').single();
        const aid = (row as { id: string } | null)?.id;
        if (!aid) continue;
        await admin.from('assignment_snapshots').insert({
          user_id: userId, assignment_id: aid, score: la.score, missing: la.missing,
        });
        nextList.push({
          key: `${courseId}:${la.lmsAssignmentId}`, id: aid, name: la.name,
          score: la.score, points: la.pointsPossible, missing: la.missing,
          dueAt: la.dueAt, courseId, courseName: lc.name,
        });
      }
      // Skip change detection on a course's first sync — otherwise every
      // existing assignment would be reported as "newly added" (noise).
      if (prevMap.size > 0) {
        for (const ev of detectAssignmentChanges(prevMap, nextList)) {
          events.push({ user_id: userId, type: ev.type, course_id: ev.courseId, assignment_id: ev.assignmentId, title: ev.title, message: ev.message, old_value: ev.oldValue, new_value: ev.newValue });
        }
      }
    }

    await setStage('Comparing data');
    if (events.length) await admin.from('activity_events').insert(events);
    await setStage('Updating history');
    await admin.from('lms_credentials').update({ last_verified: new Date().toISOString() }).eq('user_id', userId);

    if (runId) {
      await admin.from('sync_runs').update({
        status: 'complete', stage: 'Complete', finished_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    return json({ ok: true, events: events.length, courses: lmsCourses.length });
  } catch (e) {
    // Never erase last good data on failure — just record the failed run.
    if (runId) {
      await admin.from('sync_runs').update({
        status: 'failed', stage: 'Failed',
        error: e instanceof Error ? e.message : 'Sync failed',
        finished_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    return json({ error: e instanceof Error ? e.message : 'Sync failed' }, 502);
  }
});
