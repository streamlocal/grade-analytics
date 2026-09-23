import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/AuthContext';
import { supabase } from './services/supabaseClient';
import { api } from './services/api';
import { TopBar } from './components/ui';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import CourseDetail from './pages/CourseDetail';
import Assignments from './pages/Assignments';
import History from './pages/History';
import WhatIf from './pages/WhatIf';
import Compare from './pages/Compare';
import Settings from './pages/Settings';

export type Appearance = 'current' | 'old' | 'glass' | 'paper';

function savedAppearance(): Appearance {
  const value = localStorage.getItem('ga-appearance') ?? localStorage.getItem('ga-theme');
  if (value === 'old' || value === 'dark') return 'old';
  if (value === 'glass' || value === 'paper') return value;
  return 'current';
}

function Shell() {
  const { session, loading } = useAuth();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>(savedAppearance);
  const [appearanceError, setAppearanceError] = useState('');

  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    localStorage.setItem('ga-appearance', appearance);
  }, [appearance]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const userId = session.user.id;
    void supabase.from('user_settings').select('appearance').eq('user_id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setAppearanceError('Appearance could not be loaded from your account.'); return; }
        if (data?.appearance && ['current', 'old', 'glass', 'paper'].includes(data.appearance)) {
          setAppearance(data.appearance as Appearance);
        }
      });
    return () => { active = false; };
  }, [session?.user.id]);

  async function changeAppearance(next: Appearance) {
    setAppearance(next);
    setAppearanceError('');
    if (!session) return;
    const { error } = await supabase.from('user_settings').upsert(
      { user_id: session.user.id, appearance: next }, { onConflict: 'user_id' },
    );
    if (error) setAppearanceError('Saved on this device, but could not sync to your account.');
  }

  const checkSetup = useCallback(async () => {
    if (!session) { setNeedsSetup(null); return; }
    try {
      const s = await api.connectionStatus();
      setNeedsSetup(!s.connected);
    } catch { setNeedsSetup(true); }
  }, [session]);

  useEffect(() => { checkSetup(); }, [checkSetup]);

  async function syncNow() {
    setSyncing(true);
    try {
      await api.syncNow();
      location.hash = '#/';
      location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Sync failed. Previous data kept.');
    } finally { setSyncing(false); }
  }

  if (loading || (session && needsSetup === null)) return <main><p className="muted">Loading…</p></main>;
  if (!session) return <Login />;
  if (needsSetup) return <Setup onDone={() => setNeedsSetup(false)} />;

  return (
    <div className="workspace">
      <TopBar onSync={syncNow} syncing={syncing} />
      <div className="workspace-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/course/:id" element={<CourseDetail />} />
          <Route path="/history" element={<History />} />
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/what-if" element={<WhatIf />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/settings" element={<Settings onNeedsSetup={() => setNeedsSetup(true)} appearance={appearance}
            onAppearanceChange={changeAppearance} appearanceError={appearanceError} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  // Keep session warm: Supabase auto-refreshes; fall back to login on failure.
  useEffect(() => {
    supabase.auth.getSession();
  }, []);
  return (
    <AuthProvider>
      <HashRouter>
        <div className="app"><Shell /></div>
      </HashRouter>
    </AuthProvider>
  );
}
