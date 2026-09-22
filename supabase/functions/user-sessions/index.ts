// user-sessions: list / revoke sessions.
// list: Supabase Auth has no end-user session-listing API; we return the
// current session marker honestly instead of inventing data.
// revoke-all: global sign-out (revokes every refresh token for the user).
import { adminClient, requireUser, json } from '../_shared/auth.ts';
import { preflight } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let user, admin;
  try {
    ({ user, admin } = await requireUser(req));
  } catch (e) {
    return e as Response;
  }
  const body = await req.json().catch(() => ({}));
  const a = adminClient();
  void admin;

  if (body.action === 'list') {
    // Best-effort: report the current JWT's session only.
    return json({ sessions: [{ id: `current-${user.id.slice(0, 8)}`, created_at: user.created_at, current: true }] });
  }
  if (body.action === 'revoke-all') {
    const { error } = await a.auth.admin.signOut(user.id, 'global' as never);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }
  return json({ error: 'Per-session revoke is not exposed by Supabase Auth; use sign out of all devices.' }, 400);
});
