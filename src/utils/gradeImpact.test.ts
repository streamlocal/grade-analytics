import { describe, expect, it } from 'vitest';
import { previewAssignment } from './gradeImpact';
import type { Assignment, Course } from '../models/types';

const course: Course = {
  id: 'biology', lms_course_id: '1', name: 'AP Biology', course_code: null, teacher_names: [],
  current_score: 90, current_grade: 'A-', points_possible: null, tracked: true, level: 'AP',
  categories: [],
};
const graded = { id: 'old', course_id: 'biology', score: 90, points_possible: 100, category: null, excused: false } as Assignment;
const upcoming = { id: 'new', course_id: 'biology', score: null, points_possible: 100, category: null, excused: false } as Assignment;

describe('assignment impact preview', () => {
  it('keeps hypothetical math separate from the live course object', () => {
    const result = previewAssignment(upcoming, course, [graded, upcoming], [course], 1);
    expect(result?.courseScore).toBe(95);
    expect(result?.gpa).toBe(4.5);
    expect(course.current_score).toBe(90);
  });
  it('does not invent an impact for an assignment without points', () => {
    expect(previewAssignment({ ...upcoming, points_possible: null }, course, [graded], [course], 1)).toBeNull();
  });
});
