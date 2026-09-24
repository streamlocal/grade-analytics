import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/AuthContext';
import { Card, SyncHelp } from '../components/ui';
import { fmtDateTime } from '../utils/format';
import type { Appearance } from '../App';
import CanvasTokenGuide from '../components/CanvasTokenGuide';

interface ConnStatus {
  connected: boolean;
  base_url?: string;
  provider?: string;
  token_last4?: string;
  last_verified?: string;
}

const appearances: { id: Appearance; name: string; description: string }[] = [
  { id: 'current', name: 'Current', description: 'Clean and familiar' },
  { id: 'old', name: 'Old', description: 'The original dark look' },
  { id: 'glass', name: 'Glass', description: 'Frosted Windows-style panels' },
  { id: 'paper', name: 'Paper', description: 'Quiet and minimal' },
];

export default function Settings({ onNeedsSetup, appearance, onAppearanceChange, appearanceError }: {
  onNeedsSetup: () => void;
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  appearanceError: string;
}) {
  const { signOut, remember, setRemember } = useAuth();
  const [conn, setConn] = useState<ConnStatus | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; created_at: string; last_active?: string; current?: boolean }[]>([]);
  const [lastSync, setLastSync] = useState<string>('—');
  const [classes, setClasses] = useState<{ id: string; lms_course_id: string; name: string; tracked: boolean }[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesMessage, setClassesMessage] = useState('');

  async function loadClasses() {
    setClassesLoading(true);
    const { data, error } = await supabase.from('courses').select('id,lms_course_id,name,tracked').order('name');
    if (error) setClassesMessage(`Could not load classes: ${error.message}`);
    else {
      const rows = (data ?? []) as { id: string; lms_course_id: string; name: string; tracked: boolean }[];
      setClasses(rows);
      setSelectedClasses(rows.filter((course) => course.tracked).map((course) => course.lms_course_id));
    }
    setClassesLoading(false);
  }

  async function refresh() {
    setConnectionLoading(true);
    try {
      const s = await api.connectionStatus();
      setConn(s);
    } catch { setConn({ connected: false }); }
    setConnectionLoading(false);
    const { data } = await supabase.from('sync_runs').select('started_at')
      .eq('status', 'complete')
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (data) setLastSync(fmtDateTime((data as { started_at: string }).started_at));
    try {
      const sess = await api.listSessions();
      setSessions(sess.sessions ?? []);
    } catch { /* Auth API may not expose list; ignore */ }
    await loadClasses();
  }
  useEffect(() => { refresh(); }, []);

  async function run(fn: () => Promise<unknown>, label: string) {
    setBusy(true); setMsg(label + '…');
    if (label === 'Sync now') setSyncing(true);
    try { await fn(); setMsg(label + ' — done.'); await refresh(); }
    catch (e: unknown) { setMsg(`${label} failed: ${e instanceof Error ? e.message : 'error'}`); }
    finally { setBusy(false); setSyncing(false); }
  }

  async function saveClasses() {
    setBusy(true);
    setClassesMessage('Saving tracked classes…');
    try {
      await api.setTracked(selectedClasses);
      setClasses((current) => current.map((course) => ({ ...course, tracked: selectedClasses.includes(course.lms_course_id) })));
      setClassesMessage('Tracked classes saved. New selections will appear after the next sync.');
    } catch (error) {
      setClassesMessage(`Could not save classes: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally { setBusy(false); }
  }

  async function discoverClasses() {
    setBusy(true);
    setClassesMessage('Checking Canvas for classes…');
    try {
      await api.discoverCourses();
      await loadClasses();
      setClassesMessage('Class list updated. Choose which classes to track.');
    } catch (error) {
      setClassesMessage(`Could not check Canvas: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally { setBusy(false); }
  }

  return (
    <main className="settings-page">
      <div className="page-heading">
        <div><p className="eyebrow">Your workspace</p><h1>Settings</h1><p className="page-subtitle">Manage Canvas, your data, and this device.</p></div>
      </div>
      {msg && <p className="settings-message" role="status">{msg}</p>}

      <div className="settings-grid">
        <Card className="settings-card">
          <div className="settings-card-head">
            <div><span className="settings-kicker">Canvas</span><h2>Connection</h2></div>
            {!connectionLoading && <span className={`status-pill ${conn?.connected ? 'success' : 'neutral'}`}>{conn?.connected ? 'Connected' : 'Not connected'}</span>}
          </div>
          {connectionLoading ? <p className="muted">Checking connection…</p> : conn?.connected ? (
            <div className="settings-detail">
              <strong>{conn.base_url}</strong>
              <span>Access token ending in ••••{conn.token_last4}</span>
              <span>Verified {conn.last_verified ? fmtDateTime(conn.last_verified) : '—'}</span>
            </div>
          ) : <p className="muted">Connect Canvas to update your classes and grades.</p>}
          <div className="settings-actions">
            <button className="btn" disabled={busy} onClick={() => run(api.testConnection, 'Test connection')}>Test connection</button>
            <button className="btn" disabled={busy} onClick={onNeedsSetup}>Replace token</button>
          </div>
          <div className="settings-secondary-action">
            <button className="btn ghost" disabled={busy} onClick={() => run(api.deleteCredential, 'Delete credential')}>Remove Canvas connection</button>
          </div>
        </Card>

        <Card className="settings-card settings-card-wide">
          <details className="settings-token-details">
            <summary>Need a new Canvas API token? View the walkthrough</summary>
            <CanvasTokenGuide />
          </details>
        </Card>

        <Card className="settings-card">
          <div className="settings-card-head">
            <div><span className="settings-kicker">Updates</span><h2>Synchronization</h2></div>
          </div>
          <div className="settings-detail">
            <span>Last successful sync</span>
            <strong className="settings-main-value">{lastSync}</strong>
          </div>
          <p className="muted">Your saved grades appear immediately. Canvas checks for updates once when you open the site, in the background. Use Sync now whenever you want another check.</p>
          <div className="settings-actions">
            <button className="btn primary" disabled={busy} onClick={() => run(api.syncNow, 'Sync now')}>{syncing ? 'Syncing…' : 'Sync now'}</button>
            {syncing && <SyncHelp />}
          </div>
        </Card>

        <Card className="settings-card settings-card-wide">
          <div className="settings-card-head">
            <div><span className="settings-kicker">Canvas</span><h2>Tracked classes</h2></div>
            <span className="status-pill neutral">{selectedClasses.length} selected</span>
          </div>
          <p className="muted">Choose which Canvas classes appear on your dashboard. You can change this after sign-up without replacing your token.</p>
          {classesLoading ? <p className="muted">Loading classes…</p> : classes.length ? <div className="settings-class-list">
            {classes.map((course) => <label key={course.id} className="settings-checkbox">
              <input type="checkbox" checked={selectedClasses.includes(course.lms_course_id)}
                onChange={(event) => setSelectedClasses((current) => event.target.checked ? [...current, course.lms_course_id] : current.filter((id) => id !== course.lms_course_id))} />
              <span><strong>{course.name}</strong></span>
            </label>)}
          </div> : <p className="muted">No classes found yet. Connect Canvas, then check for classes.</p>}
          {classesMessage && <p className="muted" role="status">{classesMessage}</p>}
          <div className="settings-actions">
            <button type="button" className="btn primary" disabled={busy || classesLoading || !classes.length || !selectedClasses.length || classes.every((course) => course.tracked === selectedClasses.includes(course.lms_course_id))} onClick={saveClasses}>Save classes</button>
            <button type="button" className="btn" disabled={busy || !conn?.connected} onClick={discoverClasses}>Check Canvas for classes</button>
          </div>
        </Card>

        <Card className="settings-card settings-card-wide appearance-card">
          <div className="settings-card-head">
            <div><span className="settings-kicker">Display</span><h2>Appearance</h2></div>
          </div>
          <p className="muted">Choose a look for your workspace. Your choice follows your account across both sites.</p>
          <div className="appearance-options" role="group" aria-label="Appearance preset">
            {appearances.map((option) => (
              <button key={option.id} type="button" className={`appearance-option ${appearance === option.id ? 'selected' : ''}`}
                aria-pressed={appearance === option.id} onClick={() => onAppearanceChange(option.id)}>
                <span className={`appearance-preview ${option.id}`} aria-hidden="true"><i /><b /><em /><small /></span>
                <strong>{option.name}</strong><small>{option.description}</small>
              </button>
            ))}
          </div>
          {appearanceError && <p className="error appearance-error" role="status">{appearanceError}</p>}
        </Card>

        <Card className="settings-card">
          <div className="settings-card-head">
            <div><span className="settings-kicker">Your records</span><h2>Data</h2></div>
          </div>
          <p className="muted">Download a copy of your grades and activity.</p>
          <div className="settings-actions">
            <button className="btn" disabled={busy} onClick={() => run(async () => {
              const d = await api.exportData();
              const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob); a.download = 'grade-analytics-export.json'; a.click();
            }, 'Export my data')}>Export my data</button>
          </div>
          <div className="settings-danger">
            <strong>Delete grade data</strong>
            <p>This removes your saved grades and Canvas connection.</p>
            <button className="btn danger" disabled={busy} onClick={() => { if (confirm('Delete ALL grade data and credential?')) run(api.deleteAllData, 'Delete all data'); }}>Delete all grade data</button>
          </div>
        </Card>

        <Card className="settings-card">
          <div className="settings-card-head">
            <div><span className="settings-kicker">Account</span><h2>Sessions and devices</h2></div>
          </div>
          <label className="settings-checkbox">
            <input type="checkbox" checked={remember} onChange={(e) => { void setRemember(e.target.checked); }} />
            <span><strong>Remember this device</strong><small>Keep me signed in here until I sign out.</small></span>
          </label>
          {sessions.length > 0 ? <div className="session-list">{sessions.map((s) => (
            <div key={s.id} className="session-row">
              <span>{s.current ? 'This device' : 'Other session'}<small>Started {fmtDateTime(s.created_at)}</small></span>
              {!s.current && <button className="btn ghost" disabled={busy} onClick={() => run(() => api.revokeSession(s.id), 'Revoke session')}>Revoke</button>}
            </div>
          ))}</div> : <p className="muted settings-small">Other device sessions aren't available right now.</p>}
          <div className="settings-actions">
            <button className="btn" disabled={busy} onClick={() => run(signOut, 'Sign out on this device')}>Sign out on this device</button>
            <button className="btn danger" disabled={busy} onClick={() => run(() => supabase.auth.signOut({ scope: 'global' }), 'Sign out of all devices')}>Sign out of all devices</button>
          </div>
        </Card>
      </div>
    </main>
  );
}
