import { useEffect, useRef, useState } from 'react';
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
import AdminDashboard from './pages/AdminDashboard';
import QuizTake from './pages/QuizTake';
import Quizzes from './pages/Quizzes';
import QuizAssignment from './pages/QuizAssignment';

export type Appearance = 'current' | 'old' | 'glass' | 'paper';
let siteLoadSyncUser: string | null = null;
let siteLoadSyncPromise: Promise<unknown> | null = null;

function savedAppearance(): Appearance {
  const value = localStorage.getItem('ga-appearance');
  if (value === 'old') return 'old';
  if (value === 'glass' || value === 'paper') return value;
  return 'current';
}

function Shell() {
  const { session, loading } = useAuth();
  // Do not hold the whole app behind a cold backend check after sign-in.
  // We still confirm the connection before starting a Canvas sync, and redirect
  // accounts without one to setup as soon as that check completes.
  const [needsSetup, setNeedsSetup] = useState(false);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [appearance, setAppearance] = useState<Appearance>(savedAppearance);
  const [appearanceError, setAppearanceError] = useState('');
  const [adminPassword, setAdminPassword] = useState<string | null>(null);
  const appearanceWrite = useRef<Promise<void>>(Promise.resolve());
  const appearanceVersion = useRef(0);
  const appearanceUser = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    localStorage.setItem('ga-appearance', appearance);
  }, [appearance]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const userId = session.user.id;
    if (appearanceUser.current !== userId) {
      appearanceUser.current = userId;
      setAppearance('current');
    }
    const refresh = async () => {
      const version = appearanceVersion.current;
      await appearanceWrite.current;
      const { data, error } = await supabase.from('user_settings').select('appearance').eq('user_id', userId).maybeSingle();
      if (!active || version !== appearanceVersion.current) return;
      if (error) { setAppearanceError('Appearance could not be loaded from your account.'); return; }
      const accountAppearance = data?.appearance;
      setAppearance(['current', 'old', 'glass', 'paper'].includes(accountAppearance ?? '') ? accountAppearance as Appearance : 'current');
      setAppearanceError('');
    };
    const onFocus = () => { void refresh(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session?.user.id]);

  async function changeAppearance(next: Appearance) {
    const version = ++appearanceVersion.current;
    setAppearance(next);
    setAppearanceError('');
    if (!session) return;
    const userId = session.user.id;
    appearanceWrite.current = appearanceWrite.current.catch(() => {}).then(async () => {
      const { error } = await supabase.from('user_settings').upsert(
        { user_id: userId, appearance: next }, { onConflict: 'user_id' },
      );
      if (error && version === appearanceVersion.current) {
        setAppearanceError('Saved on this device, but could not sync to your account.');
      }
    });
    await appearanceWrite.current;
  }

  useEffect(() => {
    let active = true;
    if (!session) {
      setNeedsSetup(false);
      setConnectionChecked(false);
      return () => { active = false; };
    }
    setAdminPassword(null);
    setConnectionChecked(false);
    setNeedsSetup(false);
    void api.connectionStatus().then((status) => {
      if (active) {
        setNeedsSetup(!status.connected);
        setConnectionChecked(true);
      }
    }).catch(() => {
      // A temporary network/auth error is not evidence that the saved Canvas
      // token is gone. Keep showing saved data instead of demanding a new key.
      if (active) setSyncError('Could not verify the Canvas connection right now. Showing your saved data; reload to retry.');
    });
    return () => { active = false; };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session) {
      siteLoadSyncUser = null;
      siteLoadSyncPromise = null;
      return;
    }
    if (!connectionChecked || needsSetup) return;
    if (siteLoadSyncUser !== session.user.id) {
      siteLoadSyncUser = session.user.id;
      siteLoadSyncPromise = api.quickSync();
    }
    let active = true;
    setSyncing(true);
    void siteLoadSyncPromise!.then(() => {
      if (active) window.dispatchEvent(new Event('ga-sync-complete'));
    }).catch((error) => {
      if (active) setSyncError(`Could not update Canvas on this load. Showing the last saved data. ${error instanceof Error ? error.message : ''}`);
    }).finally(() => { if (active) setSyncing(false); });
    return () => { active = false; };
  }, [session?.user.id, connectionChecked, needsSetup]);

  async function syncNow() {
    setSyncing(true);
    try {
      await api.syncNow();
      setSyncError('');
      window.dispatchEvent(new Event('ga-sync-complete'));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Sync failed. Previous data kept.');
    } finally { setSyncing(false); }
  }

  if (loading) return <main><p className="muted">Loading…</p></main>;
  if (!session) return <Login />;
  if (needsSetup) return <Setup onDone={() => {
    siteLoadSyncUser = session.user.id;
    siteLoadSyncPromise = Promise.resolve();
    setNeedsSetup(false);
  }} />;

  return (
    <div className="workspace">
      <TopBar onSync={syncNow} syncing={syncing} />
      <div className="workspace-main">
        {syncError && <div className="site-sync-error error" role="status">{syncError}</div>}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/course/:id" element={<CourseDetail />} />
          <Route path="/history" element={<History />} />
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/quiz/:courseId/:quizId" element={<QuizTake />} />
          <Route path="/quizzes" element={<Quizzes />} />
          <Route path="/quiz-assignment/:courseId/:assignmentId" element={<QuizAssignment />} />
          <Route path="/what-if" element={<WhatIf />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/settings" element={<Settings onNeedsSetup={() => setNeedsSetup(true)} appearance={appearance}
            onAppearanceChange={changeAppearance} appearanceError={appearanceError} onAdminVerified={setAdminPassword} />} />
          <Route path="/admin" element={adminPassword ? <AdminDashboard password={adminPassword} onSignOut={() => setAdminPassword(null)} /> : <Navigate to="/settings" replace />} />
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
