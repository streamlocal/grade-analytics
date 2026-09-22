import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
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
  const links = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/history', label: 'History', end: false },
    { to: '/assignments', label: 'Assignments', end: false },
    { to: '/compare', label: 'Compare', end: false },
    { to: '/what-if', label: 'What-if', end: false },
    { to: '/settings', label: 'Settings', end: false },
  ];
  return (
    <header className="topbar">
      <a className="brand" href="#/">Grade Analytics</a>
      <nav>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            {l.label}
          </NavLink>
        ))}
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
