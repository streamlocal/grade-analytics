import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Card, Skeleton } from '../components/ui';
import { api } from '../services/api';

type Resolution = { quiz_id: number | null; is_quiz_assignment: boolean; html_url: string | null; name: string };

export default function QuizAssignment() {
  const { courseId = '', assignmentId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [result, setResult] = useState<Resolution | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void api.quiz({ action: 'resolve', course_id: courseId, assignment_id: assignmentId }).then((value) => {
      if (!active) return;
      const resolved = value as Resolution;
      if (resolved.quiz_id) navigate(`/quiz/${courseId}/${resolved.quiz_id}`, { replace: true });
      else setResult(resolved);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not check this assignment in Canvas.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assignmentId, courseId, navigate]);
  const state = location.state as { canvasUrl?: string } | null;
  const canvasUrl = result?.html_url ?? state?.canvasUrl;
  const newQuiz = result?.is_quiz_assignment === true;
  return <main className="quiz-page">{loading ? <Skeleton lines={3} /> : <Card><p className="eyebrow">{newQuiz ? 'Canvas New Quiz' : 'Canvas assignment'}</p><h1>{result?.name ?? 'Quiz'}</h1>{error ? <p className="error" role="alert">{error}</p> : <p>{newQuiz ? 'This is a New Quiz, which Canvas requires you to take in its own quiz player. Your answers and submission stay in Canvas.' : 'Canvas did not link this assignment to a Classic Quiz that can be taken here. Open it in Canvas to continue.'}</p>}<div className="quiz-actions">{canvasUrl && /^https:\/\//.test(canvasUrl) && <a className="btn primary" href={canvasUrl} target="_blank" rel="noreferrer">Take in Canvas ↗</a>}<Link className="btn" to="/assignments">Back to assignments</Link></div></Card>}</main>;
}
