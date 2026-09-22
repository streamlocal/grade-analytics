import { useState } from 'react';
import { supabase } from '../services/supabaseClient';
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
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setMsg('Account created. Check your email to confirm, then sign in.');
        }
      }
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="card form">
        <h1>Grade Analytics</h1>
        <p className="muted">Private dashboard. Sign in once per device — your session persists until you log out.</p>
        <form onSubmit={submit}>
          <label>Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} />
          </label>
          <label className="row" style={{ flexDirection: 'row' }}>
            <input type="checkbox" style={{ width: 18 }} checked={remember}
              onChange={(e) => { void setRemember(e.target.checked); }} />
            Remember this device (default ON)
          </label>
          <div className="row">
            <button className="btn primary" disabled={busy}>
              {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <button type="button" className="btn ghost" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null); }}>
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
