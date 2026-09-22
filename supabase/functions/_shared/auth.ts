import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function requireUser(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });
  return { user: data.user, admin };
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// AES-GCM encrypt/decrypt. Key = base64(32 bytes) in CREDENTIAL_ENCRYPTION_KEY.
// Alternative: Supabase Vault (pgsodium). Either way the key never reaches the browser.
async function importKey() {
  const b64 = Deno.env.get('CREDENTIAL_ENCRYPTION_KEY');
  if (!b64) throw new Error('CREDENTIAL_ENCRYPTION_KEY not set');
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptToken(token: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ct))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

export async function decryptToken(ciphertext: string, iv: string): Promise<string> {
  const key = await importKey();
  const ct = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const ivb = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivb }, key, ct);
  return new TextDecoder().decode(pt);
}

export async function getCredential(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await admin.from('lms_credentials').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as null | {
    user_id: string; provider: string; base_url: string;
    ciphertext: string; iv: string; token_last4: string; last_verified: string | null;
  };
}

export async function decryptCredential(admin: ReturnType<typeof adminClient>, userId: string) {
  const cred = await getCredential(admin, userId);
  if (!cred) throw new Error('No LMS credential saved.');
  const token = await decryptToken(cred.ciphertext, cred.iv);
  return { cred, token };
}
