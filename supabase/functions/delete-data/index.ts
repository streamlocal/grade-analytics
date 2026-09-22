// delete-data: remove ALL of the user's rows + stored credential.
import { adminClient, requireUser, json } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let user;
  try {
    ({ user } = await requireUser(req));
  } catch (e) {
    return e as Response;
  }
  const a = adminClient();
  // Order matters (children first).
  await a.from('activity_events').delete().eq('user_id', user.id);
  await a.from('assignment_snapshots').delete().eq('user_id', user.id);
  await a.from('assignments').delete().eq('user_id', user.id);
  await a.from('course_snapshots').delete().eq('user_id', user.id);
  await a.from('courses').delete().eq('user_id', user.id);
  await a.from('sync_runs').delete().eq('user_id', user.id);
  await a.from('user_settings').delete().eq('user_id', user.id);
  await a.from('lms_credentials').delete().eq('user_id', user.id);
  return json({ ok: true });
});
