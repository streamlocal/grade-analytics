import type { ReactNode } from 'react';
import { useAuth } from '../hooks/AuthContext';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
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

export function TopBar({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  const { user, signOut } = useAuth();
  return (
    <header className="topbar">
      <a className="brand" href="#/">Grade Analytics</a>
      <nav>
        <a href="#/">Dashboard</a>
        <a href="#/assignments">Assignments</a>
        <a href="#/compare">Compare</a>
        <a href="#/what-if">What-if</a>
        <a href="#/settings">Settings</a>
      </nav>
      <div className="topbar-right">
        <button className="btn primary" onClick={onSync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
        <span className="user" title={user?.email}>{user?.email?.split('@')[0]}</span>
        <button className="btn ghost" onClick={signOut}>Logout</button>
      </div>
    </header>
  );
}
