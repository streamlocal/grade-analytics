import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, Skeleton } from '../components/ui';
import { useCourses } from '../hooks/useData';
import { api } from '../services/api';

type Quiz = { id: number; title: string; html_url?: string; due_at?: string | null; locked_for_user?: boolean; quiz_type?: string; question_count?: number };

export default function Quizzes() {
  const { courses, loading: coursesLoading } = useCourses();
  const [items, setItems] = useState<{ courseId: string; courseName: string; quiz: Quiz }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (coursesLoading) return;
    let active = true;
    const tracked = courses.filter((course) => course.tracked);
    if (!tracked.length) { setLoading(false); return; }
    void Promise.allSettled(tracked.map(async (course) => ({ course, quizzes: await api.listQuizzes(course.lms_course_id) as Quiz[] }))).then((results) => {
      if (!active) return;
      const found = results.flatMap((result) => result.status === 'fulfilled' && Array.isArray(result.value.quizzes) ? result.value.quizzes.map((quiz) => ({ courseId: result.value.course.lms_course_id, courseName: result.value.course.name, quiz })) : []);
      setItems(found.sort((a, b) => Date.parse(a.quiz.due_at ?? '') - Date.parse(b.quiz.due_at ?? '')));
      if (results.every((result) => result.status === 'rejected')) setError('Canvas quizzes could not be loaded. Try again later or open Canvas.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [coursesLoading, courses]);
  return <main className="quiz-page"><div className="page-heading"><div><p className="eyebrow">Coursework</p><h1>Quizzes</h1><p className="page-subtitle">View quiz details here and take each quiz in Canvas.</p></div><Link className="btn" to="/assignments">Assignments</Link></div>{error && <div className="error" role="alert">{error}</div>}{loading ? <Skeleton lines={4} /> : !items.length ? <Empty title="No quizzes found" hint="Canvas quizzes will appear here after a sync." /> : <div className="quiz-questions">{items.map(({ courseId, courseName, quiz }) => <Card key={`${courseId}:${quiz.id}`}><h2>{quiz.title}</h2><p className="muted">{courseName}{quiz.due_at ? ` · Due ${new Date(quiz.due_at).toLocaleString()}` : ''}{quiz.question_count != null ? ` · ${quiz.question_count} questions` : ''}</p><div className="quiz-actions">{quiz.html_url && /^https:\/\//.test(quiz.html_url) && <a className="btn primary" href={quiz.html_url} target="_blank" rel="noreferrer">Take in Canvas ↗</a>}</div></Card>)}</div>}</main>;
}
