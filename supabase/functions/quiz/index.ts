import { requireUser, decryptCredential, json } from '../_shared/auth.ts';
import { preflight } from '../_shared/cors.ts';

const identifier = (value: unknown) => /^\d+$/.test(String(value ?? '')) ? String(value) : null;

async function canvas(base: string, token: string, path: string) {
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const raw = await response.text();
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
      ? data.message : `Canvas returned ${response.status}. Open this quiz in Canvas if it requires additional restrictions.`;
    return json({ error: message, canvas_status: response.status }, response.status);
  }
  return json(data);
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let user, admin;
  try { ({ user, admin } = await requireUser(req)); } catch (error) { return error as Response; }
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? '');
    const course = identifier(body.course_id);
    if (!course) return json({ error: 'A valid course is required.' }, 400);
    if (action !== 'list') return json({ error: 'In-site quiz attempts are no longer supported. Open the quiz in Canvas.' }, 410);
    const { cred, token } = await decryptCredential(admin, user.id);
    if (cred.provider !== 'canvas') return json({ error: 'Canvas quiz browsing is unavailable for this connection.' }, 400);
    const root = `/api/v1/courses/${course}/quizzes`;
    return await canvas(cred.base_url, token, `${root}?per_page=100`);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Quiz request failed.' }, 502);
  }
});
