import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, getRememberPreference } from '../services/supabaseClient';

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  remember: boolean;
  setRemember: (v: boolean) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null, user: null, loading: true, remember: true,
  setRemember: () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [remember, setRememberState] = useState(getRememberPreference());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const setRemember = (v: boolean) => {
    setRememberState(v);
    localStorage.setItem('ga-remember', v ? 'on' : 'off');
  };

  const signOut = async () => {
    await supabase.auth.signOut(); // current device
    setSession(null);
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading, remember, setRemember, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
