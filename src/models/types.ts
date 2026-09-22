import type { CourseLevel } from '../utils/gpa';

export interface Course {
  id: string;
  lms_course_id: string;
  name: string;
  course_code: string | null;
  teacher_names: string[];
  current_score: number | null;
  current_grade: string | null;
  points_possible: number | null;
  tracked: boolean;
  level: CourseLevel;
  score_override: number | null;
  categories: { name: string; weight: number }[];
}

export interface CourseSnapshot {
  id: string;
  course_id: string;
  score: number | null;
  grade: string | null;
  points_possible: number | null;
  created_at: string;
}

export interface Assignment {
  id: string;
  course_id: string;
  lms_assignment_id: string;
  name: string;
  category: string | null;
  due_at: string | null;
  points_possible: number | null;
  score: number | null;
  grade: string | null;
  missing: boolean;
  late: boolean;
  excused: boolean;
  submitted_at: string | null;
  html_url: string | null;
}

export interface ActivityEvent {
  id: string;
  type: string;
  course_id: string | null;
  assignment_id: string | null;
  title: string;
  message: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

export interface SyncRun {
  id: string;
  status: 'running' | 'complete' | 'failed';
  stage: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export type SyncStage =
  | 'Connecting'
  | 'Fetching courses'
  | 'Fetching assignments'
  | 'Comparing data'
  | 'Updating history'
  | 'Complete';
