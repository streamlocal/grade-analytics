// cron-trigger: invoked by pg_cron (or the daily-sync GitHub workflow) with
// the CRON_SECRET bearer token. Fans out a per-user sync using each account's
// stored encrypted credential — no user session required.
import { adminClient, json } from '../_shared/auth.ts';
import { preflight } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const secret = Deno.env.get('CRON_SECRET');
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (!secret || auth !== secret) return json({ error: 'Forbidden' }, 403);

  const admin = adminClient();
  const deadline = AbortSignal.timeout(90_000);
  const [{ data: creds, error: credsError }, { data: settings, error: settingsError }] = await Promise.all([
    admin.from('lms_credentials').select('user_id').abortSignal(deadline),
    admin.from('user_settings').select('user_id,daily_sync').abortSignal(deadline),
  ]);
  if (credsError || settingsError) {
    console.error('Could not load scheduled sync targets', credsError, settingsError);
    return json({ error: 'Could not load scheduled sync targets' }, 502);
  }

  const optedOut = new Set(
    ((settings ?? []) as { user_id: string; daily_sync: boolean }[])
      .filter((s) => s.daily_sync === false).map((s) => s.user_id)
  );
  const targets = ((creds ?? []) as { user_id: string }[])
    .map((c) => c.user_id).filter((id) => !optedOut.has(id));

  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/sync`;
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  let started = 0, running = 0, failed = 0, next = 0;
  // Each sync acknowledges after acquiring its lock, without waiting for
  // Canvas or database writes. A small pool bounds simultaneous requests.
  await Promise.all(Array.from({ length: Math.min(3, targets.length) }, async () => {
    while (next < targets.length && !deadline.aborted) {
      const userId = targets[next++];
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'sync', for_user: userId, background: true }),
          signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]),
        });
        await response.body?.cancel().catch(() => {});
        if (response.status === 202) started++;
        else if (response.status === 409) running++; // Existing per-user lock.
        else {
          failed++;
          console.error('Scheduled sync dispatch failed', response.status);
        }
      } catch (error) {
        failed++;
        console.error('Scheduled sync dispatch failed', error);
      }
    }
  }));
  const undispatched = targets.length - next;
  if (undispatched) console.error('Scheduled sync dispatch deadline reached', { undispatched });
  failed += undispatched;
  return json({ ok: failed === 0, triggered: started, already_running: running, failed, users: targets.length }, failed ? 502 : 202);
});
