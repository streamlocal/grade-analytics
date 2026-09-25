// Admin enrollment and dashboard. The keyboard phrase in the UI is only a
// convenience to open this flow; all authorization happens here.
import { adminClient, requireUser, json } from '../_shared/auth.ts';
import { preflight } from '../_shared/cors.ts';

const DEFAULT_ITERATIONS = 310_000;
const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function isBootstrapUser(user: { email?: string | null }): Promise<boolean> {
  const allowed = (Deno.env.get('ADMIN_BOOTSTRAP_EMAILS') ?? '')
    .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  return Boolean(user.email && allowed.includes(user.email.toLowerCase()));
}

async function getAdmin(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await admin.from('admin_users').select('user_id,display_name').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as { user_id: string; display_name: string } | null;
}

async function verifyPassword(admin: ReturnType<typeof adminClient>, userId: string, password: string): Promise<boolean> {
  const { data, error } = await admin.from('admin_credentials').select('password_salt,password_hash,password_iterations').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const row = data as { password_salt: string; password_hash: string; password_iterations: number };
  const actual = await derive(password, fromB64(row.password_salt), row.password_iterations);
  return sameBytes(actual, fromB64(row.password_hash));
}

async function dashboard(admin: ReturnType<typeof adminClient>) {
  const [users, courses, assignments, events, runs] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from('courses').select('user_id,tracked', { count: 'exact' }),
    admin.from('assignments').select('user_id', { count: 'exact' }),
    admin.from('activity_events').select('id,user_id,type,title,message,created_at').order('created_at', { ascending: false }).limit(30),
    admin.from('sync_runs').select('user_id,status,stage,error,started_at,finished_at').order('started_at', { ascending: false }).limit(40),
  ]);
  if (users.error) throw users.error;
  if (courses.error) throw courses.error;
  if (assignments.error) throw assignments.error;
  if (events.error) throw events.error;
  if (runs.error) throw runs.error;

  const courseRows = (courses.data ?? []) as { user_id: string; tracked: boolean }[];
  const assignmentRows = (assignments.data ?? []) as { user_id: string }[];
  const emailById = new Map((users.data.users ?? []).map((user) => [user.id, user.email ?? 'Unknown account']));
  const summaryByUser = new Map<string, { user_id: string; email: string; courses: number; tracked_courses: number; assignments: number; created_at: string }>();
  for (const user of users.data.users ?? []) summaryByUser.set(user.id, { user_id: user.id, email: user.email ?? 'Unknown account', courses: 0, tracked_courses: 0, assignments: 0, created_at: user.created_at });
  for (const row of courseRows) {
    const summary = summaryByUser.get(row.user_id);
    if (summary) { summary.courses += 1; if (row.tracked) summary.tracked_courses += 1; }
  }
  for (const row of assignmentRows) {
    const summary = summaryByUser.get(row.user_id);
    if (summary) summary.assignments += 1;
  }
  const runRows = (runs.data ?? []) as { user_id: string; status: string; stage: string | null; error: string | null; started_at: string; finished_at: string | null }[];
  return {
    metrics: {
      users: users.data.users.length,
      courses: courses.count ?? courseRows.length,
      tracked_courses: courseRows.filter((course) => course.tracked).length,
      assignments: assignments.count ?? assignmentRows.length,
      failed_syncs: runRows.filter((run) => run.status === 'failed').length,
      syncs_24h: runRows.filter((run) => Date.now() - Date.parse(run.started_at) <= 86_400_000).length,
    },
    users: Array.from(summaryByUser.values()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100),
    recent_syncs: runRows.slice(0, 20).map((run) => ({ ...run, email: emailById.get(run.user_id) ?? 'Unknown account' })),
    recent_activity: (events.data ?? []).map((event) => ({ ...event, email: emailById.get((event as { user_id: string }).user_id) ?? 'Unknown account' })),
  };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let user, admin;
  try { ({ user, admin } = await requireUser(req)); } catch (error) { return error as Response; }
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? 'status');
  try {
    const currentAdmin = await getAdmin(admin, user.id);
    if (action === 'status') {
      return json({ is_admin: Boolean(currentAdmin), can_enroll: !currentAdmin && await isBootstrapUser(user), display_name: currentAdmin?.display_name ?? null });
    }
    if (action === 'enroll') {
      if (currentAdmin || !(await isBootstrapUser(user))) return json({ error: 'This account is not allowed to enroll as an administrator.' }, 403);
      const displayName = String(body.display_name ?? '').trim();
      const password = String(body.password ?? '');
      if (displayName.length < 2 || displayName.length > 80) return json({ error: 'Enter an administrator name.' }, 400);
      if (password.length < 12) return json({ error: 'Use an administrator password with at least 12 characters.' }, 400);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await derive(password, salt, DEFAULT_ITERATIONS);
      const { error: userError } = await admin.from('admin_users').insert({ user_id: user.id, display_name: displayName });
      if (userError) return json({ error: userError.message }, 409);
      const { error: credentialError } = await admin.from('admin_credentials').insert({ user_id: user.id, password_salt: b64(salt), password_hash: b64(hash), password_iterations: DEFAULT_ITERATIONS });
      if (credentialError) {
        await admin.from('admin_users').delete().eq('user_id', user.id);
        return json({ error: credentialError.message }, 500);
      }
      return json({ ok: true, is_admin: true, display_name: displayName });
    }
    if (!currentAdmin) return json({ error: 'Administrator access required.' }, 403);
    const password = String(body.password ?? '');
    if (action === 'verify') return json({ verified: await verifyPassword(admin, user.id, password) });
    if (action === 'dashboard') {
      if (!(await verifyPassword(admin, user.id, password))) return json({ error: 'Administrator password is incorrect.' }, 401);
      return json(await dashboard(admin));
    }
    return json({ error: 'Unknown admin action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Admin request failed.' }, 500);
  }
});
