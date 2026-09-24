// sync: discover courses, set tracked, or run a full synchronization.
// Modes: { mode: 'discover' } | { mode: 'set-tracked', course_ids } |
// { mode: 'quick' } (page load: grades + assignments only) | { mode: 'sync' }
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

async function stableAnnouncementId(userId: string, courseId: string, announcementId: string): Promise<string> {
  const input = new TextEncoder().encode(`canvas-announcement:${userId}:${courseId}:${announcementId}`);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', input)).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function announcementPreview(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim().slice(0, 260);
}

// Canvas has three requests per course for assignments. A small pool keeps the
// refresh responsive without flooding Canvas with every course at once.
async function mapWithConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await work(items[index]);
    }
  });
  await Promise.all(workers);
  return output;
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

  // ---- quick or full sync (locked: one running job per user) ----
  // One sync at a time per user. A crashed/timed-out run older than 15 minutes
  // is reclaimed so a dead lock can never block future syncs permanently.
  const { data: existing } = await admin.from('sync_runs').select('id,started_at')
    .eq('user_id', userId).eq('status', 'running').limit(1);
  if (existing?.length) {
    const row = existing[0] as { id: string; started_at: string };
    const ageMs = Date.now() - new Date(row.started_at).getTime();
    if (ageMs < 15 * 60_000) {
      return json({ error: 'A sync is already running for this account.' }, 409);
    }
    await admin.from('sync_runs').update({
      status: 'failed', stage: 'Timed out', error: 'Stale lock reclaimed',
      finished_at: new Date().toISOString(),
    }).eq('id', row.id);
  }

  const { data: run, error: runErr } = await admin.from('sync_runs')
    .insert({ user_id: userId, status: 'running', stage: 'Connecting' }).select('id').single();
  if (runErr || !run) {
    // Lost a race for the lock — treat as "already running".
    return json({ error: 'A sync is already running for this account.' }, 409);
  }
  const runId = (run as { id: string }).id;
  const setStage = (stage: string) =>
    runId ? admin.from('sync_runs').update({ stage }).eq('id', runId) : Promise.resolve();

  try {
    const { cred, token } = await decryptCredential(admin, userId);
    const provider = getProvider(cred.provider);

    await setStage('Fetching courses');
    const lmsCourses = await provider.fetchCourses(cred.base_url, token);

    // Previous state for change detection and the existing tracked-course set.
    const { data: prevCourses } = await admin.from('courses').select('*').eq('user_id', userId);
    const prevByLms = new Map(((prevCourses ?? []) as Record<string, unknown>[]).map((c) => [
      (c as { lms_course_id: string }).lms_course_id, c as {
        id: string; current_score: number | null; name: string; tracked: boolean;
      },
    ]));

    // A reload should never turn into a full account inventory. It reads the
    // current Canvas scores and assignments for courses already being tracked;
    // course discovery, history snapshots, activity, and announcements remain
    // part of the explicit/daily full sync.
    if (mode === 'quick') {
      const trackedLmsCourses = lmsCourses.filter((course) => prevByLms.get(course.lmsCourseId)?.tracked !== false && prevByLms.has(course.lmsCourseId));
      await setStage('Updating current grades');
      if (trackedLmsCourses.length) {
        await admin.from('courses').upsert(trackedLmsCourses.map((course) => ({
          user_id: userId, lms_course_id: course.lmsCourseId, name: course.name,
          course_code: course.courseCode, teacher_names: course.teachers,
          current_score: course.currentScore, current_grade: course.currentGrade,
          updated_at: new Date().toISOString(),
        })), { onConflict: 'user_id,lms_course_id' });
      }

      await setStage('Fetching assignments');
      const fetchedByCourse = await mapWithConcurrency(trackedLmsCourses, 3, async (course) => {
        try {
          return { course, fetched: await provider.fetchAssignments(cred.base_url, token, course.lmsCourseId) };
        } catch {
          return { course, fetched: null };
        }
      });

      await setStage('Saving assignments');
      await Promise.all(fetchedByCourse.map(async ({ course, fetched }) => {
        if (!fetched) return;
        const courseId = prevByLms.get(course.lmsCourseId)?.id;
        if (!courseId || !fetched.assignments.length) return;
        await admin.from('assignments').upsert(fetched.assignments.map((assignment) => ({
          user_id: userId, course_id: courseId, lms_assignment_id: assignment.lmsAssignmentId,
          name: assignment.name, category: assignment.category, due_at: assignment.dueAt,
          points_possible: assignment.pointsPossible, score: assignment.score, grade: assignment.grade,
          missing: assignment.missing, late: assignment.late, excused: assignment.excused,
          submitted_at: assignment.submittedAt, html_url: assignment.htmlUrl,
          updated_at: new Date().toISOString(),
        })), { onConflict: 'course_id,lms_assignment_id' });
      }));

      await admin.from('lms_credentials').update({ last_verified: new Date().toISOString() }).eq('user_id', userId);
      await admin.from('sync_runs').update({
        status: 'complete', stage: 'Complete', finished_at: new Date().toISOString(),
      }).eq('id', runId);
      return json({ ok: true, kind: 'quick', courses: trackedLmsCourses.length });
    }

    await setStage('Fetching assignments');
    const events: unknown[] = [];
    const trackedCourses: { lmsId: string; id: string; name: string }[] = [];
    // Start the network work concurrently (three courses at a time). The old
    // implementation waited for every request in one course before touching
    // the next, which made even a normal six-course manual sync feel stalled.
    const assignmentFetches = await mapWithConcurrency(lmsCourses, 3, async (course) => {
      try {
        return [course.lmsCourseId, await provider.fetchAssignments(cred.base_url, token, course.lmsCourseId)] as const;
      } catch {
        return [course.lmsCourseId, null] as const;
      }
    });
    const fetchedAssignments = new Map(assignmentFetches);

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
      trackedCourses.push({ lmsId: lc.lmsCourseId, id: courseId, name: lc.name });

      const gEvent = detectCourseGradeChange(lc.name, courseId, prev?.current_score ?? null, lc.currentScore);
      if (gEvent && prev) {
        events.push({ user_id: userId, ...gEvent, old_value: gEvent.oldValue, new_value: gEvent.newValue });
      }
      await admin.from('course_snapshots').insert({
        user_id: userId, course_id: courseId,
        score: lc.currentScore, grade: lc.currentGrade,
      });

      // Assignments + Canvas categories (assignment groups) for this course.
      const fetched = fetchedAssignments.get(lc.lmsCourseId);
      if (!fetched) continue; // partial failure: keep previous assignment data for this course
      const lmsAssign = fetched.assignments;
      // Store real category names + weights for the What-if simulator.
      await admin.from('courses').update({ categories: fetched.categories }).eq('id', courseId);
      const { data: prevAssign } = await admin.from('assignments').select('*').eq('course_id', courseId);
      const prevMap = new Map(((prevAssign ?? []) as Record<string, unknown>[]).map((a) => {
        const r = a as { id: string; lms_assignment_id: string; name: string; score: number | null; points_possible: number | null; missing: boolean; due_at: string | null; submitted_at: string | null };
        return [`${courseId}:${r.lms_assignment_id}`, { id: r.id, name: r.name, score: r.score, points: r.points_possible, missing: r.missing, dueAt: r.due_at, submittedAt: r.submitted_at }];
      }));

      const assignmentRows = lmsAssign.map((la) => ({
          user_id: userId, course_id: courseId, lms_assignment_id: la.lmsAssignmentId,
          name: la.name, category: la.category, due_at: la.dueAt,
          points_possible: la.pointsPossible, score: la.score, grade: la.grade,
          missing: la.missing, late: la.late, excused: la.excused,
          submitted_at: la.submittedAt, html_url: la.htmlUrl,
          updated_at: new Date().toISOString(),
      }));
      const { data: savedAssignments } = assignmentRows.length
        ? await admin.from('assignments').upsert(assignmentRows, { onConflict: 'course_id,lms_assignment_id' })
          .select('id,lms_assignment_id')
        : { data: [] };
      const assignmentIdByLms = new Map(((savedAssignments ?? []) as { id: string; lms_assignment_id: string }[])
        .map((assignment) => [assignment.lms_assignment_id, assignment.id]));
      const snapshots = lmsAssign.flatMap((la) => {
        const assignmentId = assignmentIdByLms.get(la.lmsAssignmentId);
        return assignmentId ? [{ user_id: userId, assignment_id: assignmentId, score: la.score, missing: la.missing }] : [];
      });
      if (snapshots.length) await admin.from('assignment_snapshots').insert(snapshots);
      const nextList: NextAssign[] = lmsAssign.flatMap((la) => {
        const aid = assignmentIdByLms.get(la.lmsAssignmentId);
        return aid ? [{
          key: `${courseId}:${la.lmsAssignmentId}`, id: aid, name: la.name,
          score: la.score, points: la.pointsPossible, missing: la.missing,
          dueAt: la.dueAt, submittedAt: la.submittedAt, courseId, courseName: lc.name,
        }] : [];
      });
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
    let announcementErrors = 0;
    if (provider.fetchAnnouncements) {
      await setStage('Fetching announcements');
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      await mapWithConcurrency(trackedCourses, 3, async (course) => {
        try {
          const announcements = await provider.fetchAnnouncements(cred.base_url, token, course.lmsId, since);
          for (const item of announcements) {
            const postedAt = new Date(item.postedAt).getTime();
            if (!Number.isFinite(postedAt) || postedAt < Date.now() - 7 * 86400_000 || postedAt > Date.now()) continue;
            const id = await stableAnnouncementId(userId, course.lmsId, item.lmsAnnouncementId);
            const preview = announcementPreview(item.message);
            const { error: insertError } = await admin.from('activity_events').upsert({
              id, user_id: userId, type: 'ANNOUNCEMENT_POSTED', course_id: course.id,
              title: item.title, message: preview ? `${course.name} · ${preview}` : course.name,
              old_value: null,
              new_value: { posted_at: item.postedAt, html_url: item.htmlUrl },
            }, { onConflict: 'id', ignoreDuplicates: true });
            if (insertError) throw insertError;
          }
        } catch (error) {
          announcementErrors++;
          console.warn('Could not fetch announcements for a course', course.lmsId, error);
        }
      });
    }
    await setStage('Updating history');
    await admin.from('lms_credentials').update({ last_verified: new Date().toISOString() }).eq('user_id', userId);

    if (runId) {
      await admin.from('sync_runs').update({
        status: 'complete', stage: 'Complete', finished_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    return json({ ok: true, events: events.length, courses: lmsCourses.length, announcement_errors: announcementErrors });
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
