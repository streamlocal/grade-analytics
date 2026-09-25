import { requireUser, decryptCredential, json } from '../_shared/auth.ts';
import { preflight } from '../_shared/cors.ts';

type RequestBody = Record<string, unknown>;
const identifier = (value: unknown) => /^\d+$/.test(String(value ?? '')) ? String(value) : null;

async function canvas(base: string, token: string, path: string, method = 'GET', body?: RequestBody) {
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
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
    const body = await req.json().catch(() => ({})) as RequestBody;
    const action = String(body.action ?? '');
    const course = identifier(body.course_id);
    if (!course) return json({ error: 'A valid course is required.' }, 400);
    const quiz = identifier(body.quiz_id);
    if (action !== 'list' && !quiz) return json({ error: 'A valid quiz is required.' }, 400);
    const submission = identifier(body.submission_id);
    if (['questions', 'answer', 'flag', 'submit', 'time'].includes(action) && !submission) return json({ error: 'A valid quiz attempt is required.' }, 400);
    const { cred, token } = await decryptCredential(admin, user.id);
    if (cred.provider !== 'canvas') return json({ error: 'This quiz interface requires Canvas.' }, 400);
    const root = `/api/v1/courses/${course}/quizzes`;
    if (action === 'list') return await canvas(cred.base_url, token, `${root}?per_page=100`);
    if (action === 'details') return await canvas(cred.base_url, token, `${root}/${quiz}`);
    if (action === 'start') return await canvas(cred.base_url, token, `${root}/${quiz}/submissions`, 'POST', body.access_code ? { access_code: String(body.access_code) } : {});
    if (action === 'questions') return await canvas(cred.base_url, token, `/api/v1/quiz_submissions/${submission}/questions?include[]=quiz_question&per_page=100`);
    if (action === 'time') return await canvas(cred.base_url, token, `${root}/${quiz}/submissions/${submission}/time`);
    const attempt = Number(body.attempt);
    const validationToken = String(body.validation_token ?? '');
    if (!Number.isSafeInteger(attempt) || attempt < 1 || !validationToken) return json({ error: 'Quiz attempt credentials are missing.' }, 400);
    const requestBody: RequestBody = { attempt, validation_token: validationToken };
    if (body.access_code) requestBody.access_code = String(body.access_code);
    if (action === 'answer') {
      const question = identifier(body.question_id);
      if (!question) return json({ error: 'A valid question is required.' }, 400);
      requestBody.quiz_questions = [{ id: Number(question), answer: body.answer }];
      return await canvas(cred.base_url, token, `/api/v1/quiz_submissions/${submission}/questions`, 'POST', requestBody);
    }
    if (action === 'flag') {
      const question = identifier(body.question_id);
      if (!question) return json({ error: 'A valid question is required.' }, 400);
      return await canvas(cred.base_url, token, `/api/v1/quiz_submissions/${submission}/questions/${question}/${body.flagged === true ? 'flag' : 'unflag'}`, 'PUT', requestBody);
    }
    if (action === 'submit') return await canvas(cred.base_url, token, `${root}/${quiz}/submissions/${submission}/complete`, 'POST', requestBody);
    return json({ error: 'Unknown quiz action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Quiz request failed.' }, 502);
  }
});
