import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, getRememberPreference, refreshAuthClient, onClientChange } from '../services/supabaseClient';

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  remember: boolean;
  setRemember: (v: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null, user: null, loading: true, remember: true,
  setRemember: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [remember, setRememberState] = useState(getRememberPreference());

  useEffect(() => {
    let unsub = () => {};
    const attach = () => {
      // Restore persisted session on load (persistSession=true by default).
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
        setSession(s);
        setLoading(false);
      });
      unsub = () => sub.subscription.unsubscribe();
    };
    attach();
    // If the client is rebuilt (remember toggle), re-bind listeners.
    const off = onClientChange(() => { unsub(); attach(); });
    return () => { off(); unsub(); };
  }, []);

  // Change persistence for the current device and carry the session across.
  const setRemember = async (v: boolean) => {
    localStorage.setItem('ga-remember', v ? 'on' : 'off');
    setRememberState(v);
    const { data } = await supabase.auth.getSession();
    refreshAuthClient();
    if (data.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }
  };

  const signOut = async () => {
    // Supabase defaults to a global sign-out. The ordinary button must only
    // end this browser's session; Settings has a separate all-devices action.
    await supabase.auth.signOut({ scope: 'local' });
    setSession(null);
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading, remember, setRemember, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
