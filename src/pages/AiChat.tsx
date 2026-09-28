import { useRef, useState, type FormEvent } from 'react';
import { Card } from '../components/ui';
import { api } from '../services/api';

type Source = { id: string; text: string; url: string };
type Message = { role: 'user' | 'assistant'; text: string; sources?: Source[] };

const suggestions = [
  'What would it take to reach a 4.3 GPA?',
  'What assignments need my attention this week?',
  'Which classes have changed most recently?',
  'What should I study first today?',
];

export default function AiChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  async function send(question: string) {
    const clean = question.trim();
    if (clean.length < 4 || busy) return;
    const prior = messages;
    setMessages([...prior, { role: 'user', text: clean }]);
    setDraft(''); setError(''); setBusy(true);
    try {
      const result = await api.aiChat(clean, prior.slice(-6).map(({ role, text }) => ({ role, text }))) as { answer: string; sources: Source[] };
      setMessages((current) => [...current, { role: 'assistant', text: result.answer, sources: result.sources }]);
      window.setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not get an answer right now.');
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send(draft); }

  return <main className="ai-chat-page">
    <div className="page-heading"><div><p className="eyebrow">Your workspace</p><h1>Ask AI</h1><p className="page-subtitle">Questions about your saved grades, assignments, and recent changes.</p></div>
      {messages.length > 0 && <button type="button" className="btn" onClick={() => { setMessages([]); setError(''); }}>Clear chat</button>}</div>
    <Card className="ai-chat-card">
      <div className="ai-chat-log" role="log" aria-live="polite">
        {messages.length === 0 && <div className="ai-chat-empty"><h2>What would you like to know?</h2><p>The assistant can connect your grades, upcoming work, and grade history. Choose a question or write your own.</p><div className="ai-chat-suggestions">{suggestions.map((question) => <button type="button" className="btn" key={question} onClick={() => void send(question)}>{question}</button>)}</div></div>}
        {messages.map((message, index) => <div key={index} className={`ai-chat-message ${message.role}`}>
          <strong>{message.role === 'user' ? 'You' : 'Grade Analytics'}</strong><p>{message.text}</p>
          {message.sources?.length ? <div className="ai-chat-sources"><span>From your data</span>{message.sources.map((source) => <a key={source.id} href={source.url} target={source.url.startsWith('https://') ? '_blank' : undefined} rel={source.url.startsWith('https://') ? 'noreferrer' : undefined}>{source.text.split(';')[0]} ↗</a>)}</div> : null}
        </div>)}
        {busy && <div className="ai-chat-message assistant"><strong>Grade Analytics</strong><p className="muted">Checking your saved data…</p></div>}
        <div ref={bottom} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="ai-chat-form" onSubmit={submit}><label className="sr-only" htmlFor="ai-chat-question">Ask a question</label><input id="ai-chat-question" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} placeholder="Ask about your GPA, classes, or assignments…" /><button type="submit" className="btn primary" disabled={busy || draft.trim().length < 4}>{busy ? 'Thinking…' : 'Ask'}</button></form>
      <p className="ai-chat-note">Answers use your last saved Canvas data. Trends are not guarantees; open sources to verify important details. Chat is kept only on this page and clears when you leave.</p>
    </Card>
  </main>;
}
