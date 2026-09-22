import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  console.warn(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set them in GitHub repo secrets / .env (frontend uses anon key ONLY).'
  );
}

// "Remember this device" (default ON) controls session persistence.
// ON  -> persistSession: true  (survives reload + browser restart)
// OFF -> persistSession: false (in-memory only for this session)
// Same storageKey for both so we never leak an extra persisted entry.
export function makeClient(persist: boolean): SupabaseClient {
  return createClient(url ?? '', anon ?? '', {
    auth: {
      persistSession: persist,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'grade-analytics-auth',
    },
  });
}

export function getRememberPreference(): boolean {
  return (localStorage.getItem('ga-remember') ?? 'on') !== 'off';
}

// Live binding: reassigned by refreshAuthClient() so every importer sees the
// current client without needing a page reload.
export let supabase: SupabaseClient = makeClient(getRememberPreference());

type Listener = () => void;
let listeners: Listener[] = [];

export function onClientChange(cb: Listener): () => void {
  listeners.push(cb);
  return () => { listeners = listeners.filter((l) => l !== cb); };
}

// Rebuild the client to match the current preference. Callers that already
// hold a session should re-`setSession` afterwards (see AuthContext.setRemember).
export function refreshAuthClient(): void {
  supabase = makeClient(getRememberPreference());
  listeners.forEach((l) => l());
}
