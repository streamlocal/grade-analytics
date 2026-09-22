import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  console.warn(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set them in GitHub repo secrets / .env (frontend uses anon key ONLY).'
  );
}

// "Remember this device" (default ON) controls persistence.
// When ON: persistSession=true (localStorage, survives restart).
// When OFF: session-only — we create a non-persisting client for that sign-in.
export function makeClient(persist: boolean): SupabaseClient {
  return createClient(url ?? '', anon ?? '', {
    auth: {
      persistSession: persist,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: persist ? 'grade-analytics-auth' : 'grade-analytics-auth-ephemeral',
    },
  });
}

export const supabase: SupabaseClient = makeClient(
  (localStorage.getItem('ga-remember') ?? 'on') !== 'off'
);

export function setRememberPreference(remember: boolean) {
  localStorage.setItem('ga-remember', remember ? 'on' : 'off');
}
export function getRememberPreference(): boolean {
  return (localStorage.getItem('ga-remember') ?? 'on') !== 'off';
}
