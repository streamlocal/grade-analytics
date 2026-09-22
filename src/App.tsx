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

function Shell() {
  const { session, loading } = useAuth();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('ga-theme') ?? 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ga-theme', theme);
  }, [theme]);

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
    <>
      <TopBar onSync={syncNow} syncing={syncing} />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/course/:id" element={<CourseDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/assignments" element={<Assignments />} />
        <Route path="/what-if" element={<WhatIf />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/settings" element={<Settings onNeedsSetup={() => setNeedsSetup(true)} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <button className="btn ghost theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </button>
    </>
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
