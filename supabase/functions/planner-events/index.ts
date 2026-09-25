import { requireUser, decryptCredential, json } from '../_shared/auth.ts';
import { preflight } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const { user, admin } = await requireUser(req);
    const { start, end } = await req.json();
    if (typeof start !== 'string' || typeof end !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return json({ error: 'Valid start and end dates are required.' }, 400);
    }
    const { cred, token } = await decryptCredential(admin, user.id);
    if (cred.provider !== 'canvas') return json({ error: 'Canvas is required.' }, 400);
    const { data: courses, error: courseError } = await admin.from('courses').select('lms_course_id').eq('user_id', user.id).eq('tracked', true);
    if (courseError) throw courseError;
    const contexts = (courses ?? []).map((course) => `course_${course.lms_course_id}`);
    const groups: string[][] = [[]]; // Canvas default: personal calendar
    for (let i = 0; i < contexts.length; i += 10) groups.push(contexts.slice(i, i + 10));
    const results = await Promise.all(groups.map(async (group) => {
      const params = new URLSearchParams({ type: 'event', start_date: start, end_date: end, per_page: '100' });
      for (const context of group) params.append('context_codes[]', context);
      const response = await fetch(`${cred.base_url.replace(/\/$/, '')}/api/v1/calendar_events?${params}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Canvas calendar returned ${response.status}.`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('Invalid Canvas calendar response.');
      return rows;
    }));
    const events = [...new Map(results.flat().map((event) => [String(event.id), event])).values()];
    return json(events.map((event) => ({
      id: String(event.id), title: String(event.title ?? 'Event'), start_at: event.start_at,
      html_url: typeof event.html_url === 'string' ? event.html_url : null,
      context_name: typeof event.context_name === 'string' ? event.context_name : null,
    })));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not load calendar events.' }, 502);
  }
});
