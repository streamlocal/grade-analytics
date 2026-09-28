import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Empty, Skeleton } from '../components/ui';
import { api } from '../services/api';
import { fmtDateTime } from '../utils/format';
import { overallGpa, qualityPoints } from '../utils/gpa';
import { useAi } from '../hooks/useAi';

type AiSettings = { global_enabled: boolean; local_enabled: boolean; key_configured: boolean; key_last4: string | null };

interface AdminData {
  metrics: { users: number; courses: number; tracked_courses: number; assignments: number; failed_syncs: number; syncs_24h: number };
  users: { user_id: string; email: string; courses: number; tracked_courses: number; assignments: number; created_at: string }[];
  recent_syncs: { user_id: string; email: string; status: string; stage: string | null; error: string | null; started_at: string; finished_at: string | null }[];
  recent_activity: { id: string; email: string; type: string; title: string; message: string; created_at: string }[];
}
interface AccountView { account: { user_id: string; email: string; created_at: string | null }; courses: { id: string; name: string; current_score: number | null; current_grade: string | null; tracked: boolean; level: string | null; updated_at: string | null }[]; assignments: { id: string; name: string; course_name: string; due_at: string | null; score: number | null; grade: string | null; missing: boolean; late: boolean; excused: boolean; submitted_at: string | null; html_url: string | null }[]; recent_activity: { id: string; type: string; title: string; message: string; created_at: string }[] }

export default function AdminDashboard({ password, onSignOut }: { password: string; onSignOut: () => void }) {
  const navigate = useNavigate();
  const ai = useAi();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accountView, setAccountView] = useState<AccountView | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiKeyDraft, setAiKeyDraft] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.adminDashboard(password).then((result) => {
      if (active) { setData(result as AdminData); setError(''); }
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Administrator dashboard could not load.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [password]);

  useEffect(() => {
    let active = true;
    void api.adminAiSettings(password).then((result) => {
      if (active) setAiSettings(result as AiSettings);
    }).catch((reason) => { if (active) setAiMessage(reason instanceof Error ? reason.message : 'AI settings could not load.'); });
    return () => { active = false; };
  }, [password]);

  async function saveAiKey(event: React.FormEvent) {
    event.preventDefault();
    setAiBusy(true); setAiMessage('Testing Gemini key…');
    try {
      setAiSettings(await api.adminSaveAiKey(password, aiKeyDraft) as AiSettings);
      setAiKeyDraft('');
      setAiMessage('Gemini key verified and saved.');
      ai.reload();
    } catch (reason) { setAiMessage(reason instanceof Error ? reason.message : 'Could not save the key.'); }
    finally { setAiBusy(false); }
  }

  async function toggleAi(scope: 'global' | 'local', enabled: boolean) {
    setAiBusy(true); setAiMessage('Saving AI setting…');
    try {
      setAiSettings(await api.adminToggleAi(password, scope, enabled) as AiSettings);
      setAiMessage(enabled ? 'Enabled. Existing Canvas data is being prepared in the background.' : 'Disabled.');
      ai.reload();
    } catch (reason) { setAiMessage(reason instanceof Error ? reason.message : 'Could not change AI setting.'); }
    finally { setAiBusy(false); }
  }

  function leave() {
    onSignOut();
    navigate('/settings');
  }
  async function viewAccount(userId: string) {
    setAccountLoading(true); setError('');
    try { setAccountView(await api.adminAccount(password, userId) as AccountView); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Account could not load.'); }
    finally { setAccountLoading(false); }
  }

  if (loading) return <main><Skeleton lines={5} /></main>;
  if (error) return <main><div className="error" role="alert">{error}</div><p><Link to="/settings">Back to Settings</Link></p></main>;
  if (!data) return <main><Empty title="No administrator data" /></main>;

  const cards = [
    ['Accounts', data.metrics.users],
    ['Courses', data.metrics.courses],
    ['Tracked courses', data.metrics.tracked_courses],
    ['Assignments', data.metrics.assignments],
    ['Syncs in 24 hours', data.metrics.syncs_24h],
    ['Failed syncs shown', data.metrics.failed_syncs],
  ];
  return (
    <main className="admin-page">
      <div className="page-heading">
        <div><p className="eyebrow">Administration</p><h1>Admin dashboard</h1><p className="page-subtitle">System-wide health and account activity</p></div>
        <button type="button" className="btn" onClick={leave}>Leave admin</button>
      </div>
      <div className="grid stats admin-stats">{cards.map(([label, value]) => <Card key={label as string}><div className="stat"><div className="l">{label}</div><div className="v">{value}</div></div></Card>)}</div>
      <Card className="admin-ai-card">
        <div className="section-heading"><div><p className="eyebrow">Feature controls</p><h2>AI integration</h2></div><span className={`status-pill ${aiSettings?.global_enabled ? 'success' : 'neutral'}`}>{aiSettings?.global_enabled ? 'On for everyone' : aiSettings?.local_enabled ? 'Local preview' : 'Off'}</span></div>
        <p className="muted">Use Local to test on your account. Global makes Briefing, smart search, and Ask AI available to every account on both sites. Model: Gemini 3.5 Flash-Lite.</p>
        <form className="admin-ai-key" onSubmit={(event) => void saveAiKey(event)}>
          <label>Gemini API key <span className="muted">{aiSettings?.key_configured ? `Saved · ends ${aiSettings.key_last4}` : 'No key saved'}</span>
            <input type="password" autoComplete="off" value={aiKeyDraft} onChange={(event) => setAiKeyDraft(event.target.value)} placeholder={aiSettings?.key_configured ? 'Paste a new key to replace it' : 'Paste your Gemini API key'} />
          </label>
          <button className="btn" type="submit" disabled={aiBusy || !aiKeyDraft.trim()}>Test & save key</button>
        </form>
        <div className="admin-ai-switches">
          <label><span><strong>Local preview</strong><small>Only this administrator account</small></span><input type="checkbox" checked={Boolean(aiSettings?.local_enabled)} disabled={aiBusy || !aiSettings?.key_configured} onChange={(event) => void toggleAi('local', event.target.checked)} /></label>
          <label><span><strong>Global access</strong><small>All signed-in accounts</small></span><input type="checkbox" checked={Boolean(aiSettings?.global_enabled)} disabled={aiBusy || !aiSettings?.key_configured} onChange={(event) => void toggleAi('global', event.target.checked)} /></label>
        </div>
        <p className="admin-ai-privacy">Gemini’s free tier may use submitted content to improve Google products. Switching on Global sends relevant school data for other accounts to Gemini after sync.</p>
        {aiMessage && <p className="muted" role="status">{aiMessage}</p>}
      </Card>
      <div className="admin-grid">
        <Card>
          <div className="section-heading"><h2>Accounts</h2><span className="muted">Latest first</span></div>
          <div className="admin-table-wrap"><table className="data"><thead><tr><th>Account</th><th>Courses</th><th>Assignments</th><th>Created</th></tr></thead><tbody>
            {data.users.map((user) => <tr key={user.user_id}><td><strong>{user.email}</strong><br /><button type="button" className="btn ghost" disabled={accountLoading} onClick={() => void viewAccount(user.user_id)}>View account</button></td><td>{user.tracked_courses}/{user.courses}</td><td>{user.assignments}</td><td>{fmtDateTime(user.created_at)}</td></tr>)}
          </tbody></table></div>
        </Card>
        <Card>
          <div className="section-heading"><h2>Sync health</h2><span className="muted">Recent runs</span></div>
          <div className="admin-list">{data.recent_syncs.map((run, index) => <div className="admin-list-row" key={`${run.user_id}-${run.started_at}-${index}`}>
            <span><strong>{run.email}</strong><small>{run.stage ?? '—'} · {fmtDateTime(run.started_at)}</small>{run.error && <small className="error-text">{run.error}</small>}</span>
            <span className={`status-pill ${run.status === 'complete' ? 'success' : run.status === 'failed' ? 'danger' : 'neutral'}`}>{run.status}</span>
          </div>)}</div>
        </Card>
        <Card className="admin-wide-card">
          <div className="section-heading"><h2>Recent activity</h2><span className="muted">Across all accounts</span></div>
          <div className="admin-list">{data.recent_activity.map((event) => <div className="admin-list-row" key={event.id}>
            <span><strong>{event.title}</strong><small>{event.email} · {event.type} · {fmtDateTime(event.created_at)}</small>{event.message && <small>{event.message}</small>}</span>
          </div>)}</div>
        </Card>
      </div>
      {accountView && <Card className="admin-wide-card admin-account-view"><div className="section-heading"><div><p className="eyebrow">Read-only inspection</p><h2>{accountView.account.email}</h2></div><button type="button" className="btn" onClick={() => setAccountView(null)}>Close account</button></div><div className="grid stats admin-stats"><Card><div className="stat"><div className="l">Overall average</div><div className="v">{(accountView.courses.filter(c => c.tracked && c.current_score != null).reduce((a,c) => a + Number(c.current_score), 0) / Math.max(1, accountView.courses.filter(c => c.tracked && c.current_score != null).length)).toFixed(1)}%</div></div></Card><Card><div className="stat"><div className="l">Current GPA</div><div className="v">{overallGpa(accountView.courses.filter(c => c.tracked).map(c => ({ score: c.current_score, level: (c.level ?? 'Regular') as 'Regular' | 'Honors' | 'AP' | 'Free' })))?.toFixed(3) ?? '—'}</div></div></Card><Card><div className="stat"><div className="l">Tracked classes</div><div className="v">{accountView.courses.filter(c => c.tracked).length}</div></div></Card></div><h3>Courses</h3><div className="admin-list">{accountView.courses.map(c => <div className="admin-list-row" key={c.id}><span><strong>{c.name}</strong><small>{c.current_score == null ? 'No grade' : `${Number(c.current_score).toFixed(1)}% · ${c.current_grade ?? '—'} · QP ${qualityPoints(c.current_score, (c.level ?? 'Regular') as 'Regular' | 'Honors' | 'AP' | 'Free')?.toFixed(2) ?? '—'}`}</small></span><span className="status-pill neutral">{c.tracked ? 'Tracked' : 'Hidden'}</span></div>)}</div><h3>Upcoming and recent assignments</h3><div className="admin-list">{accountView.assignments.slice(0, 30).map(a => <div className="admin-list-row" key={a.id}><span><strong>{a.name}</strong><small>{a.course_name} · {a.due_at ? fmtDateTime(a.due_at) : 'No due date'}</small></span><span className={`status-pill ${a.missing ? 'danger' : a.submitted_at ? 'success' : 'neutral'}`}>{a.missing ? 'Missing' : a.submitted_at ? 'Submitted' : 'Open'}</span></div>)}</div><h3>Recent activity</h3><div className="admin-list">{accountView.recent_activity.map(e => <div className="admin-list-row" key={e.id}><span><strong>{e.title}</strong><small>{e.type} · {fmtDateTime(e.created_at)}</small></span></div>)}</div></Card>}
    </main>
  );
}
