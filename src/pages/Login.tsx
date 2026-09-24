import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/AuthContext';

export default function Login() {
  const { remember, setRemember } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [msg, setMsg] = useState<string | null>(null);
  const [showSignInHelp, setShowSignInHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const createAccountButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showSignInHelp) return;
    createAccountButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSignInHelp(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSignInHelp]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'signup' && password !== confirmPassword) {
      setMsg('Passwords do not match. Please enter the same password twice.');
      return;
    }
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
      const message = err instanceof Error ? err.message : 'Sign-in failed.';
      if (mode === 'signin' && /invalid login credentials|invalid credentials/i.test(message)) {
        setShowSignInHelp(true);
      } else {
        setMsg(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-intro"><span className="auth-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>GRADE ANALYTICS</span></div>
      <div className="card form auth-card">
        <h1>Grade Analytics</h1>
        <p className="muted">Your grades, courses, and progress in one place.</p>
        <form onSubmit={submit}>
          <label>Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} />
          </label>
          {mode === 'signup' && <label>Confirm password
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
              autoComplete="new-password" minLength={6} aria-invalid={confirmPassword.length > 0 && confirmPassword !== password} />
          </label>}
          {mode === 'signup' && confirmPassword.length > 0 && confirmPassword !== password && <p className="error" role="status">Passwords must match.</p>}
          <label className="row" style={{ flexDirection: 'row' }}>
            <input type="checkbox" style={{ width: 18 }} checked={remember}
              onChange={(e) => { void setRemember(e.target.checked); }} />
            Remember this device (default ON)
          </label>
          <div className="row auth-actions">
            <button className="btn primary" disabled={busy || (mode === 'signup' && password !== confirmPassword)}>
              {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <button type="button" className="btn ghost" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null); setShowSignInHelp(false); }}>
              {mode === 'signin' ? 'Need an account?' : 'Have an account?'}
            </button>
          </div>
        </form>
        {msg && <p className="muted" role="status">{msg}</p>}
        <p className="muted auth-help">
          School: Canvas — saintignatius.instructure.com. To create a Canvas API token, open{' '}
          <a href="https://saintignatius.instructure.com/profile/settings" target="_blank" rel="noreferrer">
            Canvas Profile Settings
          </a>.
        </p>
      </div>
      {showSignInHelp && <div className="auth-dialog-backdrop" onClick={() => setShowSignInHelp(false)}>
        <div className="auth-dialog card" role="alertdialog" aria-modal="true" aria-labelledby="signin-help-title" aria-describedby="signin-help-description" onClick={(e) => e.stopPropagation()}>
          <h2 id="signin-help-title">Couldn’t sign in</h2>
          <p id="signin-help-description">We couldn’t recognize that email and password together. Check both entries, or create an account if you’re new here.</p>
          <div className="auth-dialog-actions">
            <button ref={createAccountButton} type="button" className="btn primary" onClick={() => { setMode('signup'); setPassword(''); setConfirmPassword(''); setShowSignInHelp(false); }}>Create account</button>
            <button type="button" className="btn" onClick={() => setShowSignInHelp(false)}>Try again</button>
          </div>
        </div>
      </div>}
    </main>
  );
}
