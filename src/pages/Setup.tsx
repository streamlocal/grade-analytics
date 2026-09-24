import { useState } from 'react';
import { api } from '../services/api';
import { SyncHelp } from '../components/ui';
import CanvasTokenGuide from '../components/CanvasTokenGuide';

const DEFAULT_BASE = 'https://saintignatius.instructure.com';

export default function Setup({ onDone }: { onDone: () => void }) {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<string>('Enter your Canvas URL and API token.');
  const [courses, setCourses] = useState<{ lms_course_id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [firstSyncing, setFirstSyncing] = useState(false);

  async function saveAndTest() {
    setBusy(true); setStatus('Saving encrypted credential…');
    try {
      await api.saveCredential(baseUrl, token);
      // Clear token from memory immediately — never keep it in state longer than needed.
      setToken('');
      setStatus('Testing connection…');
      const t = await api.testConnection();
      setStatus(`Connected: ${t.user?.name ?? 'Canvas OK'}. Discovering courses…`);
      const d = await api.discoverCourses();
      setCourses(d.courses ?? []);
      setSelected((d.courses ?? []).map((c: { lms_course_id: string }) => c.lms_course_id));
      setStep(2);
      setStatus('Select courses to track, then run first sync.');
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'failed'}. Check token / URL and retry. Nothing was erased.`);
    } finally { setBusy(false); }
  }

  async function firstSync() {
    setBusy(true); setStatus('Saving selection…');
    try {
      await api.setTracked(selected);
      setFirstSyncing(true);
      setStatus('Running first sync: Connecting → Fetching courses → Fetching assignments → Comparing → Updating history…');
      await api.syncNow();
      setStatus('First sync complete. Opening dashboard…');
      setTimeout(onDone, 800);
    } catch (e: unknown) {
      setStatus(`Sync error: ${e instanceof Error ? e.message : 'failed'}. Previous data (if any) was kept.`);
    } finally { setBusy(false); setFirstSyncing(false); }
  }

  return (
    <main className="auth-page setup-page">
      <div className="auth-intro"><span className="auth-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>GRADE ANALYTICS</span></div>
      <div className="card form auth-card setup-card">
        <h2>Welcome — connect Canvas</h2>
        <p className="muted" role="status">{status}</p>
        {step === 1 && (
          <>
            <label>Canvas URL<input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={DEFAULT_BASE} /></label>
            <label>Canvas API token<input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder="Paste the token from Canvas" /></label>
            <p className="muted setup-token-note">Your token goes to the secure connection service and is encrypted; it is never saved in this browser.</p>
            <button className="btn primary" disabled={busy || !token} onClick={saveAndTest}>Save &amp; test connection</button>
            <CanvasTokenGuide />
          </>
        )}
        {step === 2 && (
          <>
            {courses.map((c) => (
              <label key={c.lms_course_id} className="row" style={{ flexDirection: 'row' }}>
                <input type="checkbox" style={{ width: 18 }} checked={selected.includes(c.lms_course_id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, c.lms_course_id] : selected.filter((s) => s !== c.lms_course_id))} />
                {c.name}
              </label>
            ))}
            <p className="muted sync-setup-note">The first sync downloads your selected Canvas courses and assignments. It may take several minutes.</p>
            <div className="row sync-setup-actions">
              <button className="btn primary" disabled={busy || !selected.length} onClick={firstSync}>{firstSyncing ? 'Syncing…' : 'Run first sync'}</button>
              {firstSyncing && <SyncHelp first />}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
