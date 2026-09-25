import { useId, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/AuthContext';
import { useBeta } from '../beta';

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`card ${className}`}>{children}</section>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => <div key={i} className="sk-line" />)}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return <div className="empty"><strong>{title}</strong>{hint && <p>{hint}</p>}</div>;
}

export function SyncHelp({ first = false }: { first?: boolean }) {
  const id = useId();
  return (
    <span className="sync-help">
      <button type="button" className="sync-help-trigger" aria-label={first ? 'About your first sync' : 'Why syncing takes time'} aria-describedby={id}>i</button>
      <span className="sync-help-tooltip" id={id} role="tooltip">
        {first
          ? 'The first sync downloads your selected courses and assignments from Canvas. It can take several minutes. Keep this page open.'
          : 'Syncing downloads your courses and assignments from Canvas. This can take a few minutes, especially with many classes. Keep this page open.'}
      </span>
    </span>
  );
}

export function TopBar({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  const { user, signOut } = useAuth();
  const beta = useBeta();
  const links = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/history', label: 'History', end: false },
    { to: '/assignments', label: 'Assignments', end: false },
    ...(beta.planner ? [{ to: '/planner', label: 'Planner', end: false }] : []),
    { to: '/compare', label: 'Compare', end: false },
    { to: '/what-if', label: 'What-if', end: false },
    { to: '/settings', label: 'Settings', end: false },
  ];
  return (
    <header className="topbar">
      <a className="brand" href="#/" aria-label="Grade Analytics dashboard">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
        <span className="brand-copy"><strong>Grade Analytics</strong><small>Canvas workspace</small></span>
      </a>
      <div className="nav-heading">Workspace</div>
      <nav aria-label="Main navigation">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="topbar-right">
        <div className="sync-action">
          <button className="btn primary sync-button" onClick={onSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          {syncing && <SyncHelp />}
        </div>
        <span className="user" title={user?.email}>{user?.email}</span>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </div>
    </header>
  );
}
