import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/AuthContext';
import { getRememberPreference, setRememberPreference } from '../services/supabaseClient';
import { Card } from '../components/ui';
import { fmtDateTime } from '../utils/format';

interface ConnStatus {
  connected: boolean;
  base_url?: string;
  provider?: string;
  token_last4?: string;
  last_verified?: string;
}

export default function Settings({ onNeedsSetup }: { onNeedsSetup: () => void }) {
  const { signOut, remember, setRemember } = useAuth();
  const [conn, setConn] = useState<ConnStatus | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; created_at: string; last_active?: string; current?: boolean }[]>([]);
  const [lastSync, setLastSync] = useState<string>('—');
  const [rememberLocal, setRememberLocal] = useState(getRememberPreference());

  async function refresh() {
    try {
      const s = await api.connectionStatus();
      setConn(s);
    } catch { setConn({ connected: false }); }
    const { data } = await supabase.from('sync_runs').select('started_at')
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (data) setLastSync(fmtDateTime((data as { started_at: string }).started_at));
    try {
      const sess = await api.listSessions();
      setSessions(sess.sessions ?? []);
    } catch { /* Auth API may not expose list; ignore */ }
  }
  useEffect(() => { refresh(); }, []);

  async function run(fn: () => Promise<unknown>, label: string) {
    setBusy(true); setMsg(label + '…');
    try { await fn(); setMsg(label + ' — done.'); await refresh(); }
    catch (e: unknown) { setMsg(`${label} failed: ${e instanceof Error ? e.message : 'error'}`); }
    finally { setBusy(false); }
  }

  return (
    <main>
      <h2>Settings</h2>
      {msg && <p className="muted">{msg}</p>}

      <Card>
        <h3>Connection</h3>
        {conn?.connected ? (
          <>
            <p>Connected · {conn.base_url} · Token ending in <strong>••••{conn.token_last4}</strong></p>
            <p className="muted">Last verified {conn.last_verified ? fmtDateTime(conn.last_verified) : '—'}. Full token is never shown.</p>
          </>
        ) : <p>Not connected.</p>}
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => run(api.testConnection, 'Test connection')}>Test Connection</button>
          <button className="btn" disabled={busy} onClick={onNeedsSetup}>Replace Credential</button>
          <button className="btn danger" disabled={busy} onClick={() => run(api.deleteCredential, 'Delete credential')}>Delete Credential</button>
        </div>
      </Card>

      <Card>
        <h3>Synchronization</h3>
        <p className="muted">Last successful sync: {lastSync} · Automatic daily sync runs via Supabase pg_cron (no user session required).</p>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => run(api.syncNow, 'Sync now')}>Sync Now</button>
        </div>
      </Card>

      <Card>
        <h3>Data</h3>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => run(async () => {
            const d = await api.exportData();
            const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = 'grade-analytics-export.json'; a.click();
          }, 'Export my data')}>Export My Data</button>
          <button className="btn danger" disabled={busy} onClick={() => { if (confirm('Delete ALL grade data and credential?')) run(api.deleteAllData, 'Delete all data'); }}>Delete All Grade Data</button>
        </div>
      </Card>

      <Card>
        <h3>Sessions / devices</h3>
        <label className="row" style={{ flexDirection: 'row' }}>
          <input type="checkbox" style={{ width: 18 }} checked={rememberLocal}
            onChange={(e) => { setRememberLocal(e.target.checked); setRememberPreference(e.target.checked); setRemember(e.target.checked); }} />
          Remember this device (default ON)
        </label>
        {sessions.length > 0 ? sessions.map((s) => (
          <div key={s.id} className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">{s.id.slice(0, 8)}… · {s.created_at}{s.current ? ' · this device' : ''}</span>
            {!s.current && <button className="btn ghost" onClick={() => run(() => api.revokeSession(s.id), 'Revoke session')}>Revoke</button>}
          </div>
        )) : <p className="muted">Session listing unavailable on this plan — use sign-out below.</p>}
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => run(signOut, 'Logout (this device)')}>Logout</button>
          <button className="btn danger" disabled={busy} onClick={() => run(() => supabase.auth.signOut({ scope: 'global' }), 'Sign out of all devices')}>Sign out of all devices</button>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Remember={remember ? 'on' : 'off'} · Sessions persist via Supabase Auth with auto-refresh; revocation is server-side.</p>
      </Card>
    </main>
  );
}
