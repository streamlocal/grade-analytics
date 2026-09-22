// Normalized internal models — providers map LMS-specific payloads into these.
// Add a new provider (e.g. PowerSchool) by implementing LMSProvider.

export interface NormCourse {
  lmsCourseId: string;
  name: string;
  courseCode: string | null;
  teachers: string[];
  currentScore: number | null;
  currentGrade: string | null;
  pointsPossible: number | null;
}

export interface NormAssignment {
  lmsAssignmentId: string;
  lmsCourseId: string;
  name: string;
  category: string | null;
  dueAt: string | null;
  pointsPossible: number | null;
  score: number | null;
  grade: string | null;
  missing: boolean;
  late: boolean;
  excused: boolean;
  submittedAt: string | null;
  htmlUrl: string | null;
}

export interface LMSProvider {
  name: string;
  testConnection(baseUrl: string, token: string): Promise<{ userName: string }>;
  fetchCourses(baseUrl: string, token: string): Promise<NormCourse[]>;
  fetchAssignments(baseUrl: string, token: string, lmsCourseId: string): Promise<NormAssignment[]>;
}

export async function canvasFetch(baseUrl: string, token: string, path: string) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error('Invalid or expired Canvas token.');
  if (res.status === 429) throw new Error('Canvas rate limit hit — retry shortly.');
  if (!res.ok) throw new Error(`Canvas API error ${res.status} on ${path}`);
  return res.json();
}
