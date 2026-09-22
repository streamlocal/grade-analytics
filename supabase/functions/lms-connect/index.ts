// lms-connect: save / status / delete the LMS credential.
// The raw token is AES-GCM encrypted (key in CREDENTIAL_ENCRYPTION_KEY)
// and stored in lms_credentials — a table with NO client access.
// Browser only ever receives masked metadata (last 4 chars).
import { adminClient, requireUser, encryptToken, getCredential, json } from '../_shared/auth.ts';
import { getProvider } from '../_shared/providers/index.ts';

Deno.serve(async (req) => {
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

  if (body.action === 'status') {
    const cred = await getCredential(a, user.id);
    if (!cred) return json({ connected: false });
    return json({
      connected: true,
      base_url: cred.base_url,
      provider: cred.provider,
      token_last4: cred.token_last4,
      last_verified: cred.last_verified,
    });
  }

  if (body.action === 'delete') {
    await a.from('lms_credentials').delete().eq('user_id', user.id);
    return json({ connected: false });
  }

  const baseUrl = String(body.base_url ?? '').replace(/\/$/, '');
  const token = String(body.token ?? '');
  if (!baseUrl.startsWith('https://') || token.length < 8) {
    return json({ error: 'Provide a valid https Canvas URL and API token.' }, 400);
  }

  // Validate against the real LMS before storing.
  try {
    await getProvider('canvas').testConnection(baseUrl, token);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Connection failed' }, 502);
  }

  const { ciphertext, iv } = await encryptToken(token);
  const last4 = token.slice(-4);
  const { error } = await a.from('lms_credentials').upsert({
    user_id: user.id,
    provider: 'canvas',
    base_url: baseUrl,
    ciphertext,
    iv,
    token_last4: last4,
    last_verified: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: error.message }, 500);

  return json({
    connected: true,
    base_url: baseUrl,
    provider: 'canvas',
    token_last4: last4,
    last_verified: new Date().toISOString(),
  });
});
