import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAssignments, useCourses } from '../hooks/useData';
import { useBetaStore } from '../hooks/useBetaStore';
import { api } from '../services/api';
import { isSubmitted } from '../utils/format';
import { Card } from '../components/ui';

type CalendarEvent = { id: string; title: string; start_at: string; html_url: string | null; context_name: string | null };
type Item = { id: string; title: string; at: string; subtitle: string; kind: 'assignment' | 'event' | 'reminder'; url?: string | null };
const dayKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const validUrl = (url?: string | null) => url && /^https:\/\//.test(url) ? url : null;

export default function Planner() {
  const { courses } = useCourses();
  const { assignments } = useAssignments();
  const store = useBetaStore();
  const [weekOffset, setWeekOffset] = useState(0);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsError, setEventsError] = useState('');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [now] = useState(() => new Date());
  const monday = useMemo(() => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7) + weekOffset * 7);
    return day;
  }, [now, weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => { const day = new Date(monday); day.setDate(day.getDate() + index); return day; }), [monday]);
  useEffect(() => {
    let active = true;
    const end = new Date(monday); end.setDate(end.getDate() + 7);
    setEventsError('');
    void api.plannerEvents(dayKey(monday), dayKey(end)).then((result) => {
      if (active) setEvents(Array.isArray(result) ? result as CalendarEvent[] : []);
    }).catch((error) => {
      if (active) { setEvents([]); setEventsError(`Canvas events could not load: ${error instanceof Error ? error.message : 'Try again later.'}`); }
    });
    return () => { active = false; };
  }, [monday]);

  const names = new Map(courses.map((course) => [course.id, course.name]));
  const items: Item[] = [
    ...assignments.filter((a) => a.due_at && !a.excused && a.score == null && !isSubmitted(a)).map((a) => ({ id: a.id, title: a.name, at: a.due_at!, subtitle: names.get(a.course_id) ?? 'Course', kind: 'assignment' as const, url: a.html_url })),
    ...events.filter((event) => event.start_at).map((event) => ({ id: event.id, title: event.title, at: event.start_at, subtitle: event.context_name ?? 'Canvas event', kind: 'event' as const, url: event.html_url })),
    ...store.data.reminders.map((reminder) => ({ id: reminder.id, title: reminder.title, at: reminder.at, subtitle: 'Personal reminder', kind: 'reminder' as const })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const today = dayKey(now);
  const todayItems = items.filter((item) => dayKey(new Date(item.at)) === today);

  async function addReminder(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !when) return;
    const at = new Date(when).toISOString();
    await store.save({ ...store.data, reminders: [...store.data.reminders, { id: crypto.randomUUID(), title: title.trim(), at }] });
    setTitle(''); setWhen('');
  }
  return <main className="planner-page">
    <div className="page-heading"><div><p className="eyebrow">Beta feature</p><h1>Weekly planner</h1><p className="page-subtitle">Due work, Canvas calendar events, and your reminders in one week.</p></div><Link className="btn" to="/assignments">Assignments</Link></div>
    <Card><h2>What needs doing today</h2>{todayItems.length ? todayItems.map((item) => <div className="planner-today" key={`${item.kind}-${item.id}`}><strong>{item.title}</strong><span>{item.subtitle}</span></div>) : <p className="muted">Nothing open is due today.</p>}</Card>
    <div className="planner-toolbar"><button className="btn" onClick={() => setWeekOffset((value) => value - 1)}>← Previous</button><strong>{days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong><button className="btn" onClick={() => setWeekOffset(0)}>This week</button><button className="btn" onClick={() => setWeekOffset((value) => value + 1)}>Next →</button></div>
    {eventsError && <p className="error" role="status">{eventsError} Assignments and reminders are still shown.</p>}
    <div className="planner-grid">{days.map((day) => <Card key={dayKey(day)} className={dayKey(day) === today ? 'planner-day today' : 'planner-day'}><h2>{day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</h2>{items.filter((item) => dayKey(new Date(item.at)) === dayKey(day)).map((item) => <div className="planner-item" key={`${item.kind}-${item.id}`}><small>{item.kind} · {new Date(item.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small><strong>{validUrl(item.url) ? <a href={validUrl(item.url)!} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</strong><span>{item.subtitle}</span>{item.kind === 'reminder' && <button type="button" className="btn ghost" onClick={() => void store.save({ ...store.data, reminders: store.data.reminders.filter((reminder) => reminder.id !== item.id) })}>Remove</button>}</div>)}</Card>)}</div>
    <Card><h2>Add a personal reminder</h2><form className="planner-reminder-form" onSubmit={addReminder}><label>Reminder<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label><label>When<input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required /></label><button className="btn primary" disabled={store.saving}>Add reminder</button></form>{store.error && <p className="error">{store.error}</p>}<p className="muted">Reminders are private to your account and appear on both sites.</p></Card>
  </main>;
}
