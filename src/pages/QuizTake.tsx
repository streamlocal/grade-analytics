import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, Skeleton } from '../components/ui';
import { api } from '../services/api';

type Choice = { id?: number; text?: string; answer_text?: string; blank_id?: string };
type Question = { id: number; question_name?: string; question_text?: string; question_type?: string; answer?: unknown; flagged?: boolean; answers?: Choice[] };
type Quiz = { title?: string; description?: string; html_url?: string; due_at?: string | null; time_limit?: number | null; locked_for_user?: boolean; lock_explanation?: string; one_question_at_a_time?: boolean; require_lockdown_browser?: boolean; question_count?: number };
type Attempt = { id: number; attempt: number; validation_token: string; end_at?: string | null; workflow_state?: string };
type QuestionResponse = { quiz_submission_questions?: (Question & { quiz_question?: Partial<Question> })[] };
const supported = new Set(['multiple_choice_question', 'true_false_question', 'multiple_answers_question', 'short_answer_question', 'essay_question', 'numerical_question', 'calculated_question', 'fill_in_multiple_blanks_question', 'multiple_dropdowns_question', 'text_only_question']);

function plainText(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return document.body.textContent?.trim() || html;
}

function QuestionBody({ html }: { html: string }) {
  return <iframe className="quiz-html" title="Canvas question content" sandbox="" srcDoc={`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:15px/1.5 system-ui,sans-serif;color:#17212f;margin:12px}img{max-width:100%;height:auto}</style>${html}`} />;
}

export default function QuizTake() {
  const { courseId = '', quizId = '' } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [saved, setSaved] = useState<Record<number, unknown>>({});
  const [accessCode, setAccessCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const key = `ga-quiz-attempt:${courseId}:${quizId}`;
    void (async () => {
      try {
        const details = await api.quiz({ action: 'details', course_id: courseId, quiz_id: quizId }) as Quiz;
        if (active) setQuiz(details);
        const stored = sessionStorage.getItem(key);
        if (!stored) return;
        const current = JSON.parse(stored) as Attempt;
        if (!current.id || !current.validation_token) return;
        const response = await api.quiz({ action: 'questions', course_id: courseId, quiz_id: quizId, submission_id: current.id }) as QuestionResponse;
        const list = (response.quiz_submission_questions ?? []).map((row) => ({ ...row.quiz_question, ...row, id: Number(row.id), answers: row.answers ?? row.quiz_question?.answers, question_text: row.question_text ?? row.quiz_question?.question_text, question_type: row.question_type ?? row.quiz_question?.question_type }));
        if (!list.length) return;
        if (active) {
          setAttempt(current);
          setQuestions(list);
          const initial = Object.fromEntries(list.filter((question) => question.answer != null).map((question) => [question.id, question.answer]));
          setAnswers(initial); setSaved(initial);
        }
      } catch (reason) {
        sessionStorage.removeItem(key);
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load quiz details.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [courseId, quizId]);

  useEffect(() => {
    if (!attempt) return;
    const tick = window.setInterval(() => setSecondsLeft((current) => current == null ? null : Math.max(0, current - 1)), 1000);
    const refresh = window.setInterval(() => {
      void api.quiz({ action: 'time', course_id: courseId, quiz_id: quizId, submission_id: attempt.id }).then((result) => {
        const time = result as { time_left?: number };
        if (typeof time.time_left === 'number') setSecondsLeft(Math.max(0, time.time_left));
      }).catch(() => {});
    }, 30000);
    return () => { window.clearInterval(tick); window.clearInterval(refresh); };
  }, [attempt, courseId, quizId]);

  const dirty = useMemo(() => !done && questions.some((question) => JSON.stringify(answers[question.id]) !== JSON.stringify(saved[question.id])), [done, questions, answers, saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const canvasUrl = quiz?.html_url && /^https:\/\//.test(quiz.html_url) ? quiz.html_url : null;
  const unsupported = questions.filter((question) => !supported.has(question.question_type ?? '') || (['fill_in_multiple_blanks_question', 'multiple_dropdowns_question'].includes(question.question_type ?? '') && !(question.answers ?? []).some((choice) => choice.blank_id)));
  const unavailable = Boolean(quiz?.locked_for_user || quiz?.one_question_at_a_time || quiz?.require_lockdown_browser);

  async function start() {
    setBusy(true); setError('');
    try {
      const result = await api.quiz({ action: 'start', course_id: courseId, quiz_id: quizId, access_code: accessCode || undefined }) as { quiz_submissions?: Attempt[] };
      const current = result.quiz_submissions?.[0];
      if (!current?.id || !current.validation_token) throw new Error('Canvas did not provide the credentials for this attempt. Continue it in Canvas.');
      setAttempt(current);
      sessionStorage.setItem(`ga-quiz-attempt:${courseId}:${quizId}`, JSON.stringify(current));
      const response = await api.quiz({ action: 'questions', course_id: courseId, quiz_id: quizId, submission_id: current.id }) as QuestionResponse;
      const list = (response.quiz_submission_questions ?? []).map((row) => ({ ...row.quiz_question, ...row, id: Number(row.id), answers: row.answers ?? row.quiz_question?.answers, question_text: row.question_text ?? row.quiz_question?.question_text, question_type: row.question_type ?? row.quiz_question?.question_type }));
      if (!list.length) throw new Error('Canvas did not return questions for this attempt. Continue it in Canvas.');
      if (quiz?.question_count && list.length < quiz.question_count) throw new Error('Canvas returned only some questions. Continue this quiz in Canvas.');
      setQuestions(list);
      const initial = Object.fromEntries(list.filter((question) => question.answer != null).map((question) => [question.id, question.answer]));
      setAnswers(initial); setSaved(initial);
      const time = await api.quiz({ action: 'time', course_id: courseId, quiz_id: quizId, submission_id: current.id }).catch(() => null) as { time_left?: number } | null;
      if (typeof time?.time_left === 'number') setSecondsLeft(Math.max(0, time.time_left));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start this quiz.'); }
    finally { setBusy(false); }
  }

  function update(question: Question, answer: unknown) {
    setAnswers((current) => ({ ...current, [question.id]: answer }));
  }

  async function save(question: Question) {
    if (!attempt) return;
    setSavingId(question.id); setError('');
    try {
      const answer = answers[question.id];
      await api.quiz({ action: 'answer', course_id: courseId, quiz_id: quizId, submission_id: attempt.id, question_id: question.id, answer, attempt: attempt.attempt, validation_token: attempt.validation_token, access_code: accessCode || undefined });
      setSaved((current) => ({ ...current, [question.id]: answer }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Canvas could not save that answer.'); throw reason; }
    finally { setSavingId(null); }
  }

  async function toggleFlag(question: Question) {
    if (!attempt) return;
    setError('');
    try {
      await api.quiz({ action: 'flag', course_id: courseId, quiz_id: quizId, submission_id: attempt.id, question_id: question.id, flagged: !question.flagged, attempt: attempt.attempt, validation_token: attempt.validation_token, access_code: accessCode || undefined });
      setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, flagged: !item.flagged } : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the flag.'); }
  }

  async function finish() {
    if (!attempt || unsupported.length || !window.confirm('Submit this quiz to Canvas? You cannot change answers after submission.')) return;
    setBusy(true); setError('');
    try {
      for (const question of questions) {
        if (JSON.stringify(answers[question.id]) !== JSON.stringify(saved[question.id])) await save(question);
      }
      await api.quiz({ action: 'submit', course_id: courseId, quiz_id: quizId, submission_id: attempt.id, attempt: attempt.attempt, validation_token: attempt.validation_token, access_code: accessCode || undefined });
      sessionStorage.removeItem(`ga-quiz-attempt:${courseId}:${quizId}`);
      setDone(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Canvas did not accept the submission.'); }
    finally { setBusy(false); }
  }

  function exit() {
    if (!dirty || window.confirm('You have unsaved answers. Leave this quiz?')) navigate('/quizzes');
  }

  function renderAnswer(question: Question) {
    const type = question.question_type ?? '';
    const value = answers[question.id] ?? '';
    const choices = question.answers ?? [];
    if (type === 'text_only_question') return <p className="muted">No answer required.</p>;
    if (type === 'multiple_choice_question' || type === 'true_false_question') return <div className="quiz-choices">{choices.map((choice) => <label key={choice.id}><input type="radio" name={`question-${question.id}`} checked={Number(value) === choice.id} onChange={() => update(question, choice.id)} />{plainText(choice.text ?? choice.answer_text ?? '')}</label>)}</div>;
    if (type === 'multiple_answers_question') return <div className="quiz-choices">{choices.map((choice) => <label key={choice.id}><input type="checkbox" checked={Array.isArray(value) && value.includes(choice.id)} onChange={(event) => update(question, event.target.checked ? [...(Array.isArray(value) ? value : []), choice.id] : (Array.isArray(value) ? value : []).filter((id: number) => id !== choice.id))} />{plainText(choice.text ?? choice.answer_text ?? '')}</label>)}</div>;
    if (type === 'essay_question') return <textarea rows={7} value={String(value)} onChange={(event) => update(question, event.target.value)} aria-label="Essay answer" />;
    if (type === 'short_answer_question' || type === 'numerical_question' || type === 'calculated_question') return <input className="quiz-text-answer" type="text" value={String(value)} onChange={(event) => update(question, event.target.value)} aria-label="Answer" />;
    if (type === 'fill_in_multiple_blanks_question' || type === 'multiple_dropdowns_question') {
      const blanks = [...new Set(choices.map((choice) => choice.blank_id).filter((id): id is string => Boolean(id)))];
      return blanks.length ? <div className="quiz-blanks">{blanks.map((blank) => <label key={blank}>{blank}{type === 'fill_in_multiple_blanks_question' ? <input type="text" value={String((value as Record<string, unknown>)?.[blank] ?? '')} onChange={(event) => update(question, { ...(typeof value === 'object' && value ? value as object : {}), [blank]: event.target.value })} /> : <select value={String((value as Record<string, unknown>)?.[blank] ?? '')} onChange={(event) => update(question, { ...(typeof value === 'object' && value ? value as object : {}), [blank]: Number(event.target.value) })}><option value="">Choose…</option>{choices.filter((choice) => choice.blank_id === blank).map((choice) => <option key={choice.id} value={choice.id}>{plainText(choice.text ?? choice.answer_text ?? '')}</option>)}</select>}</label>)}</div> : <p className="muted">This question needs Canvas to display its answer fields.</p>;
    }
    return <p className="muted">This question type is not supported here. Open it in Canvas to finish the quiz.</p>;
  }

  if (loading) return <main><Skeleton lines={4} /></main>;
  if (done) return <main className="quiz-page"><Card><h1>Quiz submitted</h1><p>Canvas accepted your submission.</p><Link className="btn primary" to="/assignments">Back to assignments</Link></Card></main>;
  return <main className="quiz-page">
    <div className="page-heading"><div><p className="eyebrow">Classic Canvas Quiz</p><h1>{quiz?.title ?? 'Quiz'}</h1><p className="page-subtitle">Your answers and flags are sent to Canvas.</p></div><button type="button" className="btn" onClick={exit}>Exit</button></div>
    {error && <div className="error" role="alert">{error}</div>}
    {canvasUrl && <p><a href={canvasUrl} target="_blank" rel="noreferrer">Open this quiz in Canvas ↗</a></p>}
    {!quiz ? <p><Link to="/quizzes">Back to quizzes</Link></p> : !attempt ? <Card><p>{quiz.question_count ?? '—'} questions · {quiz.time_limit ? `${quiz.time_limit} minute limit` : 'No listed time limit'}</p>{quiz.description && <QuestionBody html={quiz.description} />}{unavailable ? <p className="muted">Canvas requires this quiz to be taken in Canvas.</p> : <><label className="quiz-code">Access code, if required<input type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} autoComplete="off" /></label><button type="button" className="btn primary" disabled={busy} onClick={() => void start()}>{busy ? 'Starting…' : 'Start quiz in site'}</button></>}</Card> : <>
      <div className="quiz-status"><strong>{secondsLeft == null ? 'Canvas controls the time limit' : `Time remaining: ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}</strong><span>{questions.length} questions · {dirty ? 'Unsaved changes' : 'Answers saved'}</span></div>
      <label className="quiz-code">Access code, if Canvas asks for it again<input type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} autoComplete="off" /></label>
      {unsupported.length > 0 && <div className="error" role="status">This quiz contains {unsupported.length} question type(s) that need Canvas. Use the Canvas link above to complete it.</div>}
      <div className="quiz-questions">{questions.map((question, index) => <Card key={question.id}><div className="quiz-question-head"><strong>Question {index + 1}{question.flagged ? ' · Flagged' : ''}</strong><button type="button" className="btn ghost" disabled={busy} onClick={() => void toggleFlag(question)}>{question.flagged ? 'Remove flag' : 'Flag for review'}</button></div><QuestionBody html={question.question_text || question.question_name || ''} />{renderAnswer(question)}{question.question_type !== 'text_only_question' && supported.has(question.question_type ?? '') && <button type="button" className="btn" disabled={busy || savingId != null || JSON.stringify(answers[question.id]) === JSON.stringify(saved[question.id])} onClick={() => void save(question).catch(() => {})}>{savingId === question.id ? 'Saving…' : 'Save answer'}</button>}</Card>)}</div>
      <button type="button" className="btn primary quiz-submit" disabled={busy || savingId != null || unsupported.length > 0 || questions.length === 0} onClick={() => void finish()}>{busy ? 'Submitting…' : 'Submit quiz to Canvas'}</button>
    </>}
  </main>;
}
