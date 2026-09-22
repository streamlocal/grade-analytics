import { useState } from 'react';
import { supabase, makeClient } from '../services/supabaseClient';
import { useAuth } from '../hooks/AuthContext';

export default function Login() {
  const { remember, setRemember } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (!remember) {
        // Session-only device: use ephemeral client (no localStorage persistence).
        const ephemeral = makeClient(false);
        const fn = mode === 'signin' ? ephemeral.auth.signInWithPassword : ephemeral.auth.signUp;
        const { error } = await fn({ email, password });
        if (error) throw error;
        // Swap: copy session into the shared client memory only (no persist).
        const { data } = await ephemeral.auth.getSession();
        if (data.session) await supabase.auth.setSession(data.session);
        setMsg('Signed in on this device only (will not persist after tab closes).');
      } else {
        const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
        const { error } = await fn({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally { setBusy(false); }
  }

  return (
    <main>
      <div className="card form">
        <h1>Grade Analytics</h1>
        <p className="muted">Private dashboard. Sign in once per device — your session persists until you log out.</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
          <label className="row" style={{ flexDirection: 'row' }}>
            <input type="checkbox" style={{ width: 18 }} checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember this device (default ON)
          </label>
          <div className="row">
            <button className="btn primary" disabled={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
            <button type="button" className="btn ghost" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Need an account?' : 'Have an account?'}
            </button>
          </div>
        </form>
        {msg && <p className="muted">{msg}</p>}
        <p className="muted" style={{ fontSize: 12 }}>School: Canvas — saintignatius.instructure.com. Your Canvas token is stored encrypted server-side only.</p>
      </div>
    </main>
  );
}
