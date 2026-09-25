import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/AuthContext';
import { Card, SyncHelp } from '../components/ui';
import { fmtDateTime } from '../utils/format';
import type { Appearance } from '../App';
import CanvasTokenGuide from '../components/CanvasTokenGuide';
import type { CourseLevel } from '../utils/gpa';
import { betaFeatures, parseBetaFlags, type BetaFlags } from '../beta';
import { useBeta } from '../beta';
import { useBetaStore } from '../hooks/useBetaStore';

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
const courseLevels: CourseLevel[] = ['Regular', 'Honors', 'AP', 'Free'];
type SettingsCourse = { id: string; lms_course_id: string; name: string; tracked: boolean; level: CourseLevel };

export default function Settings({ onNeedsSetup, appearance, onAppearanceChange, appearanceError, onAdminVerified }: {
  onNeedsSetup: () => void;
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  appearanceError: string;
  onAdminVerified: (password: string) => void;
}) {
  const navigate = useNavigate();
  const activeBeta = useBeta();
  const betaStore = useBetaStore(activeBeta.notifications);
  const { signOut, remember, setRemember, session } = useAuth();
  const [betaDraft, setBetaDraft] = useState<BetaFlags>(() => parseBetaFlags(session?.user.user_metadata?.beta_features));
  const [betaMessage, setBetaMessage] = useState('');
  const [betaSaving, setBetaSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active && data.user && data.user.id === session?.user.id) setBetaDraft(parseBetaFlags(data.user.user_metadata?.beta_features));
    });
    return () => { active = false; };
  }, [session?.user.id]);

  async function saveBeta() {
    setBetaSaving(true);
    setBetaMessage('');
    const { error } = await supabase.auth.updateUser({ data: { beta_features: betaDraft } });
    if (!error) window.dispatchEvent(new Event('ga-beta-preferences-saved'));
    setBetaMessage(error ? `Could not save beta preferences: ${error.message}` : 'Saved to your account. Reload this page to apply these choices.');
    setBetaSaving(false);
  }
  const [conn, setConn] = useState<ConnStatus | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; created_at: string; last_active?: string; current?: boolean }[]>([]);
  const [lastSync, setLastSync] = useState<string>('—');
  const [classes, setClasses] = useState<SettingsCourse[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesMessage, setClassesMessage] = useState('');
  const [adminPrompt, setAdminPrompt] = useState<'name' | 'enroll-password' | 'login-password' | null>(null);
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirm, setAdminConfirm] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminStatus, setAdminStatus] = useState<{ is_admin: boolean; can_enroll: boolean } | null>(null);

  useEffect(() => {
    let sequence = '';
    let timer: number | undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      sequence = (sequence + event.key.toLowerCase()).slice(-8);
      if (sequence.endsWith('admin121')) {
        sequence = '';
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { sequence = ''; }, 1000);
        setAdminMessage('');
        setAdminBusy(true);
        void api.adminStatus().then((status) => {
          setAdminStatus(status as { is_admin: boolean; can_enroll: boolean });
          const nextStatus = status as { is_admin: boolean; can_enroll: boolean };
          if (nextStatus.can_enroll) setAdminPrompt('name');
          else if (nextStatus.is_admin) setAdminPrompt('login-password');
          else setAdminMessage('Administrator access is not enabled for this account.');
        }).catch((error) => setAdminMessage(error instanceof Error ? error.message : 'Administrator access is unavailable.')).finally(() => setAdminBusy(false));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); window.clearTimeout(timer); };
  }, []);

  async function submitAdminPrompt(event: React.FormEvent) {
    event.preventDefault();
    setAdminBusy(true); setAdminMessage('');
    try {
      if (adminPrompt === 'name') {
        if (!adminName.trim()) throw new Error('Enter an administrator name.');
        setAdminPrompt('enroll-password');
      } else if (adminPrompt === 'enroll-password') {
        if (adminPassword.length < 12) throw new Error('Use at least 12 characters for the administrator password.');
        if (adminPassword !== adminConfirm) throw new Error('Passwords do not match.');
        await api.adminEnroll(adminName.trim(), adminPassword);
        onAdminVerified(adminPassword);
        setAdminPrompt(null); navigate('/admin');
      } else if (adminPrompt === 'login-password') {
        if (!adminStatus?.is_admin) throw new Error('This account is not authorized for administrator access.');
        const result = await api.adminVerify(adminPassword) as { verified: boolean };
        if (!result.verified) throw new Error('Administrator password is incorrect.');
        onAdminVerified(adminPassword);
        setAdminPrompt(null); navigate('/admin');
      }
    } catch (error) { setAdminMessage(error instanceof Error ? error.message : 'Administrator setup failed.'); }
    finally { setAdminBusy(false); }
  }

  async function loadClasses() {
    setClassesLoading(true);
    const { data, error } = await supabase.from('courses').select('id,lms_course_id,name,tracked,level').order('name');
    if (error) setClassesMessage(`Could not load classes: ${error.message}`);
    else {
      const rows = (data ?? []) as SettingsCourse[];
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
    try {
      await fn();
      if (label === 'Sync now') window.dispatchEvent(new Event('ga-sync-complete'));
      setMsg(label + ' — done.');
      await refresh();
    }
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

  async function setCourseLevel(course: SettingsCourse, level: CourseLevel) {
    setBusy(true);
    setClassesMessage(`Saving ${course.name} course type…`);
    try {
      const { error } = await supabase.from('courses').update({ level }).eq('id', course.id);
      if (error) throw error;
      setClasses((current) => current.map((row) => row.id === course.id ? { ...row, level } : row));
      setClassesMessage(`${course.name} course type saved.`);
      window.dispatchEvent(new Event('ga-sync-complete'));
    } catch (error) {
      setClassesMessage(`Could not save course type: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setBusy(false);
    }
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
          <p className="muted">Choose which Canvas classes appear on your dashboard and set their actual GPA course types. Changes to these types affect GPA; test changes in Compare do not.</p>
          {classesLoading ? <p className="muted">Loading classes…</p> : classes.length ? <div className="settings-class-list">
            {classes.map((course) => <div key={course.id} className="settings-class-row">
              <label className="settings-checkbox">
                <input type="checkbox" checked={selectedClasses.includes(course.lms_course_id)}
                  onChange={(event) => setSelectedClasses((current) => event.target.checked ? [...current, course.lms_course_id] : current.filter((id) => id !== course.lms_course_id))} />
                <span><strong>{course.name}</strong></span>
              </label>
              <label className="settings-course-type">GPA course type
                <select value={course.level ?? 'Regular'} disabled={busy} onChange={(event) => void setCourseLevel(course, event.target.value as CourseLevel)}>
                  {courseLevels.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
            </div>)}
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

        <Card className="settings-card settings-card-wide" id="beta-features">
          <div className="settings-card-head"><div><span className="settings-kicker">Optional</span><h2>Beta features</h2></div><span className="status-pill neutral">Off by default</span></div>
          <p className="muted">Enable only the features you want. Each switch is saved to your account across both sites and takes effect on your next reload.</p>
          <div className="beta-settings-list">{betaFeatures.map((feature) => <label key={feature.id} className="settings-checkbox beta-setting">
            <input type="checkbox" checked={betaDraft[feature.id]} onChange={(event) => setBetaDraft((current) => ({ ...current, [feature.id]: event.target.checked }))} />
            <span><strong>{feature.name}</strong><small>{feature.description}</small></span>
          </label>)}</div>
          {betaMessage && <p className={betaMessage.startsWith('Could not') ? 'error' : 'muted'} role="status">{betaMessage}</p>}
          <div className="settings-actions"><button type="button" className="btn primary" disabled={betaSaving} onClick={saveBeta}>{betaSaving ? 'Saving…' : 'Save beta features'}</button></div>
        </Card>
        {activeBeta.notifications && <Card className="settings-card settings-card-wide"><div className="settings-card-head"><div><span className="settings-kicker">Beta</span><h2>Notification choices</h2></div></div><p className="muted">Browser permission is requested from the dashboard only if you choose to allow alerts. Updates are bundled into one digest and shown only while this tab is in the background.</p><div className="beta-notification-list">{([
          ['grades', 'New grades'], ['dueDates', 'Moved due dates'], ['dueSoon', 'Assignments due within 24 hours'], ['goalRisk', 'Goals near or below target'],
        ] as const).map(([key, label]) => <label className="settings-checkbox" key={key}><input type="checkbox" checked={betaStore.data.notify[key]} onChange={(event) => void betaStore.save({ ...betaStore.data, notify: { ...betaStore.data.notify, [key]: event.target.checked } })} /><span><strong>{label}</strong></span></label>)}</div>{betaStore.error && <p className="error">{betaStore.error}</p>}</Card>}

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
      {adminPrompt && <div className="auth-dialog-backdrop" role="presentation" onClick={() => { if (!adminBusy) setAdminPrompt(null); }}>
        <div className="auth-dialog card" role="dialog" aria-modal="true" aria-labelledby="admin-prompt-title" onClick={(event) => event.stopPropagation()}>
          <h2 id="admin-prompt-title">{adminPrompt === 'name' ? 'Administrator setup' : adminPrompt === 'enroll-password' ? 'Create administrator password' : 'Administrator sign in'}</h2>
          <p className="muted">{adminPrompt === 'name' ? 'Choose the name shown in the administrator dashboard.' : adminPrompt === 'enroll-password' ? 'This password is encrypted with a one-way hash. It is never saved as readable text.' : 'Enter your administrator password to continue.'}</p>
          <form onSubmit={submitAdminPrompt}>
            {adminPrompt === 'name' && <label>Administrator name<input autoFocus value={adminName} onChange={(event) => setAdminName(event.target.value)} required /></label>}
            {adminPrompt === 'enroll-password' && <><label>Password<input autoFocus type="password" minLength={12} value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required /></label><label>Confirm password<input type="password" minLength={12} value={adminConfirm} onChange={(event) => setAdminConfirm(event.target.value)} required /></label></>}
            {adminPrompt === 'login-password' && <label>Password<input autoFocus type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required /></label>}
            {adminMessage && <p className="error" role="alert">{adminMessage}</p>}
            <div className="auth-dialog-actions"><button className="btn primary" disabled={adminBusy}>{adminBusy ? 'Checking…' : 'Continue'}</button><button type="button" className="btn" disabled={adminBusy} onClick={() => setAdminPrompt(null)}>Cancel</button></div>
          </form>
        </div>
      </div>}
    </main>
  );
}
