// cron-trigger: invoked by pg_cron (or the daily-sync GitHub workflow) with
// the CRON_SECRET bearer token. Fans out a per-user sync using each account's
// stored encrypted credential — no user session required.
import { adminClient, json } from '../_shared/auth.ts';
import { preflight } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const secret = Deno.env.get('CRON_SECRET');
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (!secret || auth !== secret) return json({ error: 'Forbidden' }, 403);

  const admin = adminClient();
  const { data: creds } = await admin.from('lms_credentials').select('user_id');
  const { data: settings } = await admin.from('user_settings').select('user_id,daily_sync');

  const optedOut = new Set(
    ((settings ?? []) as { user_id: string; daily_sync: boolean }[])
      .filter((s) => s.daily_sync === false).map((s) => s.user_id)
  );
  const targets = ((creds ?? []) as { user_id: string }[])
    .map((c) => c.user_id).filter((id) => !optedOut.has(id));

  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/sync`;
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  let started = 0;
  for (const userId of targets) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'sync', for_user: userId }),
      });
      started++;
    } catch {
      // one user's failure must not block the rest
    }
  }
  return json({ ok: true, triggered: started, users: targets.length });
});
