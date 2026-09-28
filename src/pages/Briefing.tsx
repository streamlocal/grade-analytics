import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, Skeleton } from '../components/ui';
import { useAssignments, useCourses } from '../hooks/useData';
import { api } from '../services/api';
import { supabase } from '../services/supabaseClient';
import { fmtDateTime, isSubmitted } from '../utils/format';
import type { Assignment } from '../models/types';

type BriefItem = { text: string; ref: string; url: string };
type Brief = { headline: string; summary: string; sections: Record<'today' | 'changes' | 'grades' | 'upcoming', BriefItem[]> };
type BriefResponse = { briefing: { content: Brief; generated_at: string } | null };
type AiTag = { assignment_id: string; topics: string[] };
type AiAnswer = { answer: string; sources: { id: string; text: string; url: string }[] };
type PlanStep = { assignment_id: string; assignment_name: string; minutes: number; task: string };
type Plan = { title: string; minutes: number; steps: PlanStep[] };

const sections: { id: keyof Brief['sections']; title: string }[] = [
  { id: 'today', title: 'Today' }, { id: 'changes', title: 'Recent changes' },
  { id: 'grades', title: 'Grades' }, { id: 'upcoming', title: 'Coming up' },
];

function sourceLink(item: BriefItem) {
  const external = item.url.startsWith('https://');
  return <a href={item.url} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>{item.text}<span aria-hidden="true"> ↗</span></a>;
}

function openAssignments(rows: Assignment[]) {
  return rows.filter((item) => item.score == null && !item.excused && !isSubmitted(item) && item.due_at && Date.parse(item.due_at) >= Date.now());
}

export default function Briefing() {
  const { courses } = useCourses();
  const { assignments } = useAssignments();
  const [briefing, setBriefing] = useState<BriefResponse['briefing']>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefError, setBriefError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [tags, setTags] = useState<AiTag[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [askError, setAskError] = useState('');
  const [asking, setAsking] = useState(false);
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(45);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState('');
  const [planning, setPlanning] = useState(false);
  const names = useMemo(() => new Map(courses.map((course) => [course.id, course.name])), [courses]);
  const available = useMemo(() => openAssignments(assignments).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!)), [assignments]);

  async function loadBriefing() {
    try {
      const data = await api.aiBriefing() as BriefResponse;
      setBriefing(data.briefing);
      setBriefError('');
    } catch (error) { setBriefError(error instanceof Error ? error.message : 'Briefing could not load.'); }
    finally { setBriefLoading(false); }
  }
  useEffect(() => {
    let active = true;
    let delayed: number | undefined;
    const loadTags = async () => {
      const { data } = await supabase.from('ai_assignment_tags').select('assignment_id,topics').limit(1000);
      if (active) setTags((data ?? []) as AiTag[]);
    };
    const onSync = () => {
      delayed = window.setTimeout(() => { if (active) { void loadBriefing(); void loadTags(); } }, 8000);
    };
    void loadBriefing(); void loadTags();
    window.addEventListener('ga-sync-complete', onSync);
    return () => { active = false; window.clearTimeout(delayed); window.removeEventListener('ga-sync-complete', onSync); };
  }, []);

  async function prepareBriefing() {
    setPreparing(true); setBriefError('');
    try {
      await api.aiRefresh();
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const data = await api.aiBriefing() as BriefResponse;
        if (data.briefing && data.briefing.generated_at !== briefing?.generated_at) {
          setBriefing(data.briefing);
          break;
        }
      }
    } catch (error) { setBriefError(error instanceof Error ? error.message : 'Briefing could not be prepared.'); }
    finally { setPreparing(false); }
  }

  const collisions = useMemo(() => {
    const byDay = new Map<string, Assignment[]>();
    for (const item of available) {
      if (Date.parse(item.due_at!) > Date.now() + 14 * 86_400_000) continue;
      const day = new Date(item.due_at!).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      byDay.set(day, [...(byDay.get(day) ?? []), item]);
    }
    return [...byDay].filter(([, items]) => items.length >= 3 || (items.length >= 2 && items.some((item) => (item.points_possible ?? 0) >= 20)))
      .slice(0, 4);
  }, [available]);

  const related = useMemo(() => {
    const activeIds = new Set(available.map((item) => item.id));
    const byId = new Map(assignments.map((item) => [item.id, item]));
    const groups = new Map<string, Assignment[]>();
    for (const tag of tags) {
      if (!activeIds.has(tag.assignment_id)) continue;
      const assignment = byId.get(tag.assignment_id);
      if (!assignment) continue;
      for (const topic of tag.topics.slice(0, 3)) {
        const key = topic.toLocaleLowerCase();
        if (!key || key.length < 3) continue;
        groups.set(key, [...(groups.get(key) ?? []), assignment]);
      }
    }
    return [...groups].filter(([, items]) => items.length >= 2)
      .sort((a, b) => b[1].length - a[1].length).slice(0, 4);
  }, [available, assignments, tags]);

  async function askClass(event: React.FormEvent) {
    event.preventDefault();
    setAsking(true); setAskError(''); setAnswer(null);
    try { setAnswer(await api.aiAsk(selectedCourse, question) as AiAnswer); }
    catch (error) { setAskError(error instanceof Error ? error.message : 'Could not answer right now.'); }
    finally { setAsking(false); }
  }

  async function buildPlan(event: React.FormEvent) {
    event.preventDefault();
    setPlanning(true); setPlanError(''); setPlan(null);
    try { setPlan(await api.aiPlan(selectedAssignments, minutes) as Plan); }
    catch (error) { setPlanError(error instanceof Error ? error.message : 'Could not build a study session.'); }
    finally { setPlanning(false); }
  }

  function toggleSelection(id: string) {
    setSelectedAssignments((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(0, 8));
  }

  return <main className="briefing-page">
    <div className="page-heading"><div><p className="eyebrow">Your workspace</p><h1>Briefing</h1><p className="page-subtitle">A clear view of what needs your attention.</p></div><button type="button" className="btn" disabled={preparing} onClick={() => void prepareBriefing()}>{preparing ? 'Preparing…' : 'Update briefing'}</button></div>
    <p className="briefing-source-note">AI summaries can miss details. Open the linked Canvas items before acting on them.</p>
    {briefError && <p className="error" role="alert">{briefError}</p>}
    {briefLoading ? <Skeleton lines={5} /> : briefing ? <>
      <Card className="briefing-intro"><p className="eyebrow">Updated {fmtDateTime(briefing.generated_at)}</p><h2>{briefing.content.headline}</h2><p>{briefing.content.summary}</p></Card>
      <div className="briefing-grid">{sections.map(({ id, title }) => <Card key={id} className="briefing-section"><h2>{title}</h2>{briefing.content.sections?.[id]?.length ? <ul>{briefing.content.sections[id].map((item, index) => <li key={`${item.ref}-${index}`}>{sourceLink(item)}</li>)}</ul> : <p className="muted">Nothing to highlight right now.</p>}</Card>)}</div>
    </> : <Card><Empty title="Your first briefing is being prepared" hint="It will appear after Canvas data is synced and processed. You can also prepare it now." /></Card>}

    <div className="briefing-tools">
      <Card className="briefing-tool"><div className="section-heading"><h2>Deadline radar</h2><Link to="/assignments">All assignments ↗</Link></div>
        {collisions.length ? collisions.map(([day, items]) => <div className="briefing-collision" key={day}><strong>{day} · {items.length} assignments</strong><p>{items.slice().sort((a, b) => (b.points_possible ?? 0) - (a.points_possible ?? 0))[0].name} has the highest point value. Check its requirements early.</p><ul>{items.map((item) => <li key={item.id}><a href={item.html_url ?? '#/assignments?view=all'}>{item.name}</a><span>{names.get(item.course_id)}</span></li>)}</ul></div>) : <p className="muted">No crowded due days in the next two weeks.</p>}
      </Card>
      <Card className="briefing-tool"><h2>Related work</h2><p className="muted">Open assignments that share a topic.</p>
        {related.length ? related.map(([topic, items]) => <div className="briefing-related" key={topic}><h3>{topic}</h3><ul>{items.map((item) => <li key={item.id}><a href={item.html_url ?? '#/assignments?view=all'}>{item.name}</a><small>{names.get(item.course_id)}</small></li>)}</ul></div>) : <p className="muted">Related groups will appear as assignment topics are prepared.</p>}
      </Card>
      <Card className="briefing-tool"><h2>Ask a class</h2><p className="muted">Get a source-linked answer from your saved Canvas data.</p>
        <form className="briefing-form" onSubmit={(event) => void askClass(event)}><label>Class<select required value={selectedCourse} onChange={(event) => { setSelectedCourse(event.target.value); setAnswer(null); }}><option value="">Choose a class</option>{courses.filter((course) => course.tracked).map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label>Question<input required minLength={4} maxLength={300} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What is due in Biology this week?" /></label><button className="btn primary" disabled={asking || !selectedCourse}>{asking ? 'Checking…' : 'Ask'}</button></form>
        {askError && <p className="error" role="alert">{askError}</p>}
        {answer && <div className="briefing-answer"><p>{answer.answer}</p>{answer.sources.length > 0 && <div className="briefing-sources"><strong>Sources</strong>{answer.sources.map((source) => <a key={source.id} href={source.url}>{source.text.split(';')[0]} ↗</a>)}</div>}</div>}
      </Card>
      <Card className="briefing-tool"><h2>Study session</h2><p className="muted">Choose up to eight assignments and the time you have.</p>
        <form className="briefing-form" onSubmit={(event) => void buildPlan(event)}><div className="briefing-picks">{available.slice(0, 16).map((item) => <label key={item.id}><input type="checkbox" checked={selectedAssignments.includes(item.id)} onChange={() => toggleSelection(item.id)} /><span>{item.name}<small>{names.get(item.course_id)} · {item.due_at ? fmtDateTime(item.due_at) : 'No due date'}</small></span></label>)}</div><label>Time available<select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}><option value={25}>25 minutes</option><option value={45}>45 minutes</option><option value={60}>1 hour</option><option value={90}>90 minutes</option><option value={120}>2 hours</option></select></label><button className="btn primary" disabled={planning || !selectedAssignments.length}>{planning ? 'Building…' : 'Build session'}</button></form>
        {planError && <p className="error" role="alert">{planError}</p>}
        {plan && <div className="briefing-plan"><h3>{plan.title}</h3><p className="muted">{plan.steps.reduce((sum, step) => sum + step.minutes, 0)} of {plan.minutes} minutes planned · edit your steps below</p>{plan.steps.map((step, index) => <div className="briefing-step" key={`${step.assignment_id}-${index}`}><strong>{step.assignment_name}</strong><label>Minutes<input type="number" min={1} max={plan.minutes} value={step.minutes} onChange={(event) => setPlan((current) => current && ({ ...current, steps: current.steps.map((entry, i) => i === index ? { ...entry, minutes: Number(event.target.value) } : entry) }))} /></label><label>Task<input value={step.task} onChange={(event) => setPlan((current) => current && ({ ...current, steps: current.steps.map((entry, i) => i === index ? { ...entry, task: event.target.value } : entry) }))} /></label></div>)}</div>}
      </Card>
    </div>
  </main>;
}
