// lms-test: verify the stored credential against the live LMS.
// Returns only { ok, user_name, checked_at } — never the token.
import { adminClient, requireUser, decryptCredential, json } from '../_shared/auth.ts';
import { preflight } from '../_shared/cors.ts';
import { getProvider } from '../_shared/providers/index.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  let user;
  try {
    ({ user } = await requireUser(req));
  } catch (e) {
    return e as Response;
  }
  const a = adminClient();
  try {
    const { cred, token } = await decryptCredential(a, user.id);
    const me = await getProvider(cred.provider).testConnection(cred.base_url, token);
    const checkedAt = new Date().toISOString();
    await a.from('lms_credentials').update({ last_verified: checkedAt }).eq('user_id', user.id);
    return json({ ok: true, user: me, checked_at: checkedAt, base_url: cred.base_url });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Test failed' }, 502);
  }
});
