// export-data: return the user's own rows as JSON for download.
import { adminClient, requireUser, json } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  let user;
  try {
    ({ user } = await requireUser(req));
  } catch (e) {
    return e as Response;
  }
  const a = adminClient();
  const tables = ['courses', 'course_snapshots', 'assignments', 'assignment_snapshots', 'sync_runs', 'activity_events', 'user_settings'] as const;
  const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const t of tables) {
    const { data } = await a.from(t).select('*').eq(t === 'user_settings' ? 'user_id' : 'user_id', user.id);
    out[t] = data ?? [];
  }
  const { data: cred } = await a.from('lms_credentials').select('provider,base_url,token_last4,last_verified').eq('user_id', user.id).maybeSingle();
  out['connection'] = cred ?? null; // masked metadata only
  return json(out);
});
